import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";

export enum SyntaxNodeTypes {
    Tablature = "Tablature",
    TabSegment = "TabSegment",
    TabSegmentLine = "TabSegmentLine",
    TabString = "TabString",
    MeasureLineName = "MeasureLineName",
    MeasureLine = "MeasureLine",

    Hammer = "Hammer",
    Pull = "Pull",
    Slide = "Slide",
    Fret = "Fret",
    Harmonic = "Harmonic",
    Grace = "Frace",
    Comment = "Comment",

    RepeatLine = "RepeatLine",
    Repeat = "Repeat",
    Multiplier = "Multiplier",
    TimeSignature = "TimeSignature",
    TimeSigLine = "TimeSigLine",
    TimingLine = "TimingLine",

    Modifier = "Modifier",
    
    InvalidToken = "⚠"
}

export abstract class ASTNode {
    private ranges: Uint16Array;
    constructor(
        /// mapping of SyntaxNode type => syntax nodes where the syntax nodes are the source
        /// nodes of the parse tree from which the ASTNode is being built.
        /// currently, once i lazily parse only once, i dispose of sourceNodes (set to null) for efficiency(TODO: i might remove this feature as it might not be a good idea to dispose)
        protected sourceNodes: {[type:string]:SyntaxNode[]},
        readonly offset: number
        ) {
            let rngs = []
            for (let name in sourceNodes) {
                for (let node of sourceNodes[name]) {
                    rngs.push(node.from-offset);
                    rngs.push(node.to-offset);
                }
            }
            this.ranges = Uint16Array.from(rngs);
        }
        protected parsed = false;
        get isParsed() { return this.parsed }
    public parse(): ASTNode[] {
        this.disposeSourceNodes();
        return [];
    }
    
    protected disposeSourceNodes() {
        // TODO: consider if we should preserve sourceNodes
        this.sourceNodes = null;
    }
    
    // the length an ASTNode and all its children take up in their source array
    private _length = 1;
    public increaseLength(children: ASTNode[]) { this._length += children.length }
    get length() { return this._length; }
}


export class TabSegment extends ASTNode {
    parse(): TabBlock[] {
        if (this.parsed) return [];
        this.parsed = true;
        
        let modifiers = this.sourceNodes[SyntaxNodeTypes.TabSegment][0].getChildren(SyntaxNodeTypes.Modifier);

        let strings:SyntaxNode[][] = [];
        for (let line of this.sourceNodes[SyntaxNodeTypes.TabSegment][0].getChildren(SyntaxNodeTypes.TabSegmentLine)) {
            strings.push(line.getChildren(SyntaxNodeTypes.TabString).reverse()); //reversed for efficiency in performing remove operations
        }

        let blockAnchors:SyntaxNode[] = [];
        let blocks:SyntaxNode[][] //each array of syntax node is a block

        let string:SyntaxNode, stringLine:SyntaxNode[], bI: number, isStringPlaced:boolean, anchor:SyntaxNode; // variables used in inner loops, but defined outside loop for efficiency
        let firstUncompletedBlockIdx = 0;
        let hasGroupedAllStrings: boolean;
        do {
            hasGroupedAllStrings = true;

            for (stringLine of strings) {
                hasGroupedAllStrings = hasGroupedAllStrings && stringLine.length==0;
                if (stringLine.length==0) continue;
                
                string = stringLine.pop();
                isStringPlaced = false;
                for (bI=firstUncompletedBlockIdx; bI<blockAnchors.length; bI++) {
                    anchor = blockAnchors[bI];
                    if (anchor.to <= string.from) continue;
                    if (string.to <= anchor.from) {
                        // it doesn't overlap with any existing blocks
                        if (bI==0) {
                            blocks.unshift([string]);; //create a new block
                            blockAnchors.unshift(string); //set this as the block's anchor
                        } else {
                            blocks.splice(bI, 0, [string]);
                            blockAnchors.splice(bI, 0, string);
                        }
                        isStringPlaced = true;
                        break;
                    }
                    // at this point, `string` definitely overlaps with `anchor`
                    blocks[bI].push(string);
                    if (string.from < anchor.from) blockAnchors[bI] = string; // change this block's anchor
                }
                if (!isStringPlaced) {
                    //string doesn't belong to any existing blocks. create new block that comes after all the existing ones.
                    blocks.push([string]);
                    blockAnchors.push(string);
                    continue;
                }
            }
            // at this point, a block has definitely been grouped
            firstUncompletedBlockIdx += 1;
        } while (!hasGroupedAllStrings);

        // now we have all the blocks and their anchor nodes. now we use those anchor nodes to know what modifiers belong to what block
        let blockModifiers:SyntaxNode[][] = [];
        bI = 0;
        for (let modifier of modifiers) {
            anchor = blockAnchors[bI];
            while (anchor && anchor.to <= modifier.from) {
                anchor = blockAnchors[++bI];
            }
            if (!anchor || anchor.from >= modifier.to) {
                // if this modifier belongs to no block, add it to the nearest block on its left (and if none, the nearest on its right)
                let idx = bI==0 ? 0 : bI-1;
                if (!blockModifiers[idx]) blockModifiers[idx] = [];
                blockModifiers[idx].push(modifier);
                continue;
            }
            blockModifiers[bI].push(modifier);
        }

        let tabBlocks:TabBlock[] = [];
        for (bI=0; bI<blocks.length; bI++) {
            tabBlocks.push(new TabBlock({
                    [SyntaxNodeTypes.Modifier]: blockModifiers[bI],
                    [SyntaxNodeTypes.TabString]: blocks[bI]
                },
                this.offset
            ));
        }
        
        this.disposeSourceNodes();
        return tabBlocks;
    }
}

export class TabBlock extends ASTNode {
    parse() {
        if (this.parsed) return [];
        this.parsed = true;

        let result: ASTNode[] = [];

        let modifiers = this.sourceNodes[SyntaxNodeTypes.Modifier];
        for (let mod of modifiers) {
            result.push(Modifier.from(mod.name, {[mod.name]: [mod]}, this.offset))
        }

        let strings = this.sourceNodes[SyntaxNodeTypes.TabString];

        let measureLineNames: SyntaxNode[] = [];
        let measures: SyntaxNode[][] = [];
        for (let string of strings) {
            // make sure multiplier is inserted as a child before all measures so it is traversed first
            let multiplier = string.getChild(SyntaxNodeTypes.Multiplier);
            if (multiplier) result.push(Modifier.from(multiplier.name, {[multiplier.name]: [multiplier]}, this.offset));

            measureLineNames.push(string.getChild(SyntaxNodeTypes.MeasureLineName));
            let measurelines = string.getChildren(SyntaxNodeTypes.MeasureLine);
            for (let i=0; i<measurelines.length; i++) {
                if (!measures[i]) measures[i] = [];
                measures[i].push(measurelines[i]);
            }
        }

        result.push(new LineNaming({[SyntaxNodeTypes.MeasureLineName]: measureLineNames}, this.offset));
        for (let i=0; i<measures.length; i++) {
            result.push(new Measure({[SyntaxNodeTypes.MeasureLine]: measures[i]}, this.offset))
        }
        this.disposeSourceNodes();
        return result;
    }
}

export class Measure extends ASTNode {
    parse() {
        return [];
    }
}

export class Sound extends ASTNode {
    parse() {
        return [];
    }
}

export abstract class Note extends ASTNode {}
export class Fret extends Note {}

class MeasureLineName extends ASTNode {}
class LineNaming extends ASTNode {
    parse() {
        let names = this.sourceNodes[SyntaxNodeTypes.MeasureLineName];
        return names.map((name) => new MeasureLineName({[SyntaxNodeTypes.MeasureLineName]: [name]}, this.offset));
    }
}

// modifiers
abstract class Modifier extends ASTNode {
    static from(type: string, sourceNodes: {[type:string]:SyntaxNode[]}, offset: number): Modifier {
        switch(type) {
            case SyntaxNodeTypes.Repeat: return new Repeat(sourceNodes, offset);
            case SyntaxNodeTypes.TimeSignature: return new TimeSignature(sourceNodes, offset);
            case SyntaxNodeTypes.Modifier: return new Multiplier(sourceNodes, offset);
        }
        return null;
    }
}
class Repeat extends Modifier {}
class TimeSignature extends Modifier {}
class Multiplier extends Modifier {}