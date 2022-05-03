import { EditorState, Text } from "@codemirror/state";
import { SyntaxNode, TreeCursor } from "@lezer/common";
import { AnchoredSyntaxCursor } from "./cursors";

export enum SyntaxNodeTypes {
    Tablature = "Tablature",
    TabSegment = "TabSegment",
    TabSegmentLine = "TabSegmentLine",
    TabString = "TabString",
    MeasureLineName = "MeasureLineName",
    MeasureLine = "MeasureLine",

    Note = "Note",
    NoteDecorator = "NoteDecorator",
    NoteConnector = "NoteConnector",
    ConnectorSymbol = "ConnectorSymbol",

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

export interface SingleSpanNode {
    getRootNodeTraverser(): AnchoredSyntaxCursor | null;
}
export abstract class ASTNode {
    public get isSingleSpanNode() { return typeof (this as any).getRootNodeTraverser === "function" }
    readonly ranges: Uint16Array; // TODO: Does this really need to be Uint16Array? why not a normal array. memory benefit might be little to none
    constructor(
        /// mapping of SyntaxNode type => syntax nodes where the syntax nodes are the source
        /// nodes of the parse tree from which the ASTNode is being built.
        /// currently, once i lazily parse only once, i dispose of sourceNodes (set to null) for efficiency(TODO: i might remove this feature as it might not be a good idea to dispose)
        protected sourceNodes: {[type:string]:SyntaxNode[]},
        readonly offset: number
    ) {
        this.ranges = Uint16Array.from(this.computeRanges(sourceNodes, offset));
    }
    get name() { return this.constructor.name; }
    // parse up-keep
    private parsed = false;
    get isParsed() { return this.parsed }
    public parse(sourceText: Text): ASTNode[] {
        if (this.parsed) return [];
        this.parsed = true;
        return this.createChildren(sourceText);
    }
    protected abstract createChildren(sourceText: Text): ASTNode[];
    
    protected disposeSourceNodes() {
        // TODO: consider if we should preserve sourceNodes
        this.sourceNodes = {};
    }
    
    // the length an ASTNode and all its children take up in their source array
    private _length = 1;
    public increaseLength(children: ASTNode[]) { this._length += children.length }
    get length() { return this._length; }


    protected computeRanges(sourceNodes: {[type:string]:SyntaxNode[]}, offset: number): number[] {
        let rngs:number[] = []
        for (let name in sourceNodes) {
            for (let node of sourceNodes[name]) {
                rngs.push(node.from-offset);
                rngs.push(node.to-offset);
            }
        }
        return rngs;
    }
}


export class TabSegment extends ASTNode implements SingleSpanNode {
    public getRootNodeTraverser(): AnchoredSyntaxCursor {
        return new AnchoredSyntaxCursor(this.sourceNodes[SyntaxNodeTypes.TabSegment][0], this.offset);
    }
    protected createChildren(sourceText: Text): TabBlock[] {
        let modifiers = this.sourceNodes[SyntaxNodeTypes.TabSegment][0].getChildren(SyntaxNodeTypes.Modifier);

        let strings:SyntaxNode[][] = [];
        for (let line of this.sourceNodes[SyntaxNodeTypes.TabSegment][0].getChildren(SyntaxNodeTypes.TabSegmentLine)) {
            strings.push(line.getChildren(SyntaxNodeTypes.TabString).reverse()); //reversed for efficiency in performing remove operations
        }

        let blocks:SyntaxNode[][] = [] //each array of syntax node is a block
        let blockAnchors:{to: number, from: number}[] = [];

        let string:SyntaxNode, stringLine:SyntaxNode[], bI: number, isStringPlaced:boolean, anchor:{to: number, from: number}; // variables used in inner loops, but defined outside loop for efficiency
        let firstUncompletedBlockIdx = 0;
        let hasGroupedAllStrings: boolean;
        do {
            hasGroupedAllStrings = true;

            for (stringLine of strings) {
                hasGroupedAllStrings = hasGroupedAllStrings && stringLine.length===0;
                if (stringLine.length===0) continue;
                
                string = stringLine.pop()!;
                let stringRange = {from: this.lineDistance(string.from, sourceText), to: this.lineDistance(string.to, sourceText)};
                isStringPlaced = false;
                for (bI=firstUncompletedBlockIdx; bI<blockAnchors.length; bI++) {
                    anchor = blockAnchors[bI];
                    if (anchor.to <= stringRange.from) continue;
                    if (stringRange.to <= anchor.from) {
                        // it doesn't overlap with any existing blocks, but it comes right before this current block
                        if (bI===0) {
                            blocks.unshift([string]); //create a new block
                            blockAnchors.unshift(stringRange); //set this as the block's anchor
                        } else {
                            blocks.splice(bI, 0, [string]);
                            blockAnchors.splice(bI, 0, stringRange);
                        }
                        isStringPlaced = true;
                        break;
                    }
                    // at this point, `string` definitely overlaps with `anchor`
                    blocks[bI].push(string);
                    if (stringRange.from < anchor.from) blockAnchors[bI] = stringRange; // change this block's anchor
                    isStringPlaced = true;
                    break;
                }
                if (!isStringPlaced) {
                    // string doesn't belong to any existing blocks, but comes after all existing blocks. 
                    // create new block that comes after all the existing ones.
                    blocks.push([string]);
                    blockAnchors.push(stringRange);
                    continue;
                }
            }
            // at this point, a block has definitely been grouped
            firstUncompletedBlockIdx += 1;
        } while (!hasGroupedAllStrings);

        // now we have all the blocks and their anchor nodes. now we use those anchor nodes to know what modifiers belong to what block
        let blockModifiers:SyntaxNode[][] = [];
        let modifierRange: {from: number, to: number};
        bI = 0;
        for (let modifier of modifiers) {
            modifierRange = {from: this.lineDistance(modifier.from, sourceText), to: this.lineDistance(modifier.to, sourceText)}
            anchor = blockAnchors[bI];
            if (!blockModifiers[bI]) blockModifiers.push([]);
            while (anchor && anchor.to <= modifierRange.from) {
                anchor = blockAnchors[++bI];
            }
            if (!anchor || anchor.from >= modifierRange.to) {
                // if this modifier belongs to no block, add it to the nearest block on its left (and if none, the nearest on its right)
                let idx = bI===0 ? 0 : bI-1;
                blockModifiers[idx].push(modifier);
                continue;
            }
            blockModifiers[bI].push(modifier);
        }

        let tabBlocks:TabBlock[] = [];
        for (bI=0; bI<blocks.length; bI++) {
            tabBlocks.push(new TabBlock({
                    [SyntaxNodeTypes.Modifier]: blockModifiers[bI] || [],
                    [SyntaxNodeTypes.TabString]: blocks[bI]
                },
                this.offset
            ));
        }
        
        this.disposeSourceNodes();
        return tabBlocks;
    }

    private lineDistance(idx: number, sourceText: Text) {
        return idx - sourceText.lineAt(idx).from;
    }
}

export class TabBlock extends ASTNode {
    protected createChildren() {
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

            let mlineName = string.getChild(SyntaxNodeTypes.MeasureLineName);
            if (mlineName) measureLineNames.push(mlineName);
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
    protected createChildren(sourceText: Text): Sound[] {
        let lines = this.sourceNodes[SyntaxNodeTypes.MeasureLine];
        let measureComponentsByLine: SyntaxNode[][] = [];
        let mcAnchors: number[][] = [];
        for (let i=0; i<lines.length; i++) {
            let line = lines[i];
            measureComponentsByLine[i] = [];
            mcAnchors[i] = [];
            let cursor = line.cursor();
            if (!cursor.firstChild()) continue;
            let cursorCopy = cursor.node.cursor();
            let connectorRecursionRoot: TreeCursor | null = null;
            do {
                if (cursorCopy.type.is(SyntaxNodeTypes.Note) || cursorCopy.type.is(SyntaxNodeTypes.NoteDecorator)) {
                    measureComponentsByLine[i].push(cursorCopy.node);
                    if (cursorCopy.type.is(SyntaxNodeTypes.NoteDecorator)) {
                        mcAnchors[i].push(this.charDistance(line.from, (cursorCopy.node.getChild(SyntaxNodeTypes.Note)?.from || cursorCopy.from), sourceText));
                    } else mcAnchors[i].push(this.charDistance(line.from, cursorCopy.from, sourceText));
                    if (connectorRecursionRoot!=null) {
                        cursorCopy = connectorRecursionRoot;
                        connectorRecursionRoot = null;
                    }
                    continue;
                }
                if (!cursorCopy.node.type.is(SyntaxNodeTypes.NoteConnector)) break;
                if (!connectorRecursionRoot) connectorRecursionRoot = cursorCopy.node.cursor();
                measureComponentsByLine[i].push(cursorCopy.node);
                let connector = cursorCopy.node;
                let firstNote = connector.getChild(SyntaxNodeTypes.Note) || connector.getChild(SyntaxNodeTypes.NoteDecorator);
                if (firstNote) {
                    mcAnchors[i].push(this.charDistance(line.from, firstNote.from, sourceText));
                    cursorCopy = firstNote.cursor();
                } else {
                    mcAnchors[i].push(this.charDistance(line.from, connector.from, sourceText));
                }
            } while (cursorCopy.nextSibling());
        }

        // similar concept used in grouping TabStrings to make TabBlocks in the TabSegment.createChildren() class
        let sounds: SyntaxNode[][] = [];
        let soundAnchors: number[] = [];
        let componentPointers: number[] = new Array(lines.length).fill(0);

        let component: SyntaxNode, componentAnchor: number, soundIdx: number, hasGroupedAllSounds: boolean, isComponentPlaced: boolean;
        let firstUncompletedSoundIdx = 0;
        do {
            hasGroupedAllSounds = true;
            for (let lineNum=0; lineNum<lines.length; lineNum++) {
                component = measureComponentsByLine[lineNum][componentPointers[lineNum]];
                componentAnchor = mcAnchors[lineNum][componentPointers[lineNum]];

                hasGroupedAllSounds = hasGroupedAllSounds && !component;
                if (!component) continue;
                
                isComponentPlaced = false;
                for (soundIdx=firstUncompletedSoundIdx; soundIdx<sounds.length; soundIdx++) {
                    if (soundAnchors[soundIdx] < componentAnchor) continue;
                    if (componentAnchor < soundAnchors[soundIdx]) {
                        // component doesn't belong to any existing sound, but comes right before this current sound
                        if (soundIdx===0) {
                            sounds.unshift([component]);
                            soundAnchors.unshift(componentAnchor);
                        } else {
                            sounds.splice(soundIdx, 0, [component]);
                            soundAnchors.splice(soundIdx, 0, componentAnchor);
                        }
                        isComponentPlaced = true;
                        break;
                    }
                    sounds[soundIdx].push(component);
                    isComponentPlaced = true;
                    break;
                }
                // at this point we know this component does not belong to any exisiting sounds but comes after all existing sounds.
                if (!isComponentPlaced) {
                    sounds.push([component]);
                    soundAnchors.push(componentAnchor);
                }
                componentPointers[lineNum] = componentPointers[lineNum] + 1;
            }
            // at this point, we have definitely completed a sound
            firstUncompletedSoundIdx++;
        } while (!hasGroupedAllSounds)
        
        let result: Sound[] = []
        for (let sound of sounds) {
            result.push(new Sound({MultiType: sound}, this.offset))
        }

        return result;
    }

    private charDistance(from: number, to: number, sourceText: Text) {
        return sourceText.slice(from, to).toString().replace(/\s/g, '').length;
    }
}

export class Sound extends ASTNode {
    protected createChildren() {
        let components = this.sourceNodes.MultiType; // TODO: MultiType does not correspond to any node in the Syntax Tree. Think of a better way to transfer this data
        let result: ASTNode[] = [];
        for (let component of components) {
            if (component.type.is(SyntaxNodeTypes.Note)) result.push(Note.from(component.name, {[component.name]: [component]}, this.offset));
            else if (component.type.is(SyntaxNodeTypes.NoteDecorator)) result.push(NoteDecorator.from(component.name, {[component.name]: [component]}, this.offset));
            else if (component.type.is(SyntaxNodeTypes.NoteConnector)) result.push(NoteConnector.from(component.name, {[component.name]: [component]}, this.offset));
        }

        return result;
    }
}

class MeasureLineName extends ASTNode implements SingleSpanNode {
    public getRootNodeTraverser(): AnchoredSyntaxCursor {
        return new AnchoredSyntaxCursor(this.sourceNodes[SyntaxNodeTypes.MeasureLineName][0], this.offset);
    }
    protected createChildren() { return [] } 
}
class LineNaming extends ASTNode {
    protected createChildren(): MeasureLineName[] {
        let names = this.sourceNodes[SyntaxNodeTypes.MeasureLineName];
        return names.map((name) => new MeasureLineName({[SyntaxNodeTypes.MeasureLineName]: [name]}, this.offset));
    }
}

export abstract class NoteConnector extends ASTNode implements SingleSpanNode {
    abstract getType(): string;
    private notes: SyntaxNode[];

    public getRootNodeTraverser(): AnchoredSyntaxCursor {
        return new AnchoredSyntaxCursor(this.sourceNodes[this.getType()][0], this.offset);
    }
    
    // the raw parser parses note connectors recursively, so 5h3p2 would
    // parse as Hammer(5, Pull(3,2)), making the hammeron encompass also the fret 2
    // but the hammer relationship only connects 5 and 3, so we override the range computation to
    // reflect this fact.
    protected computeRanges(sourceNodes: { [type: string]: SyntaxNode[]; }, offset: number): any[] {
        let connector = sourceNodes[this.getType()][0];
        let notes = this.getNotesFromNoteConnector(connector);
        this.notes = [];
        if (notes.length===0) {
            this.notes = [];
            return [connector.from - offset, connector.to - offset];
        } else if (notes.length===1) {
            this.notes = notes;
            return [Math.min(connector.from, notes[0].from) - offset, Math.max(connector.to, notes[0].to) - offset];
        } else {
            this.notes = [notes[0], notes[1]];
            return [notes[0].from - offset, notes[1].to - offset];
        }
    }

    private getNotesFromNoteConnector(connector: SyntaxNode) {
        let notes:SyntaxNode[] = [];
        let cursor = connector.cursor();
        let nestedConnectorExit: SyntaxNode | null = null;
        if (!cursor.firstChild()) return [];
        do {
            if (cursor.type.is(SyntaxNodeTypes.Note) || cursor.type.is(SyntaxNodeTypes.NoteDecorator)) {
                notes.push(cursor.node);
                if (nestedConnectorExit) {
                    cursor = nestedConnectorExit.cursor();
                    nestedConnectorExit = null;
                }
            } else if (cursor.type.is(SyntaxNodeTypes.NoteConnector)) {
                nestedConnectorExit = cursor.node;
                cursor.firstChild();
            }
        } while (cursor.nextSibling());
        return notes;
    }

    protected createChildren() { return this.notes.map((node) => Note.from(node.name, {[node.name]: [node]}, this.offset)); }
    
    static isNoteConnector(name: string) { return name in [SyntaxNodeTypes.Hammer, SyntaxNodeTypes.Pull, SyntaxNodeTypes.Slide] }

    static from(type: string, sourceNodes: {[type:string]:SyntaxNode[]}, offset: number): NoteConnector {
        switch(type) {
            case SyntaxNodeTypes.Hammer: return new Hammer(sourceNodes, offset);
            case SyntaxNodeTypes.Pull: return new Pull(sourceNodes, offset);
            case SyntaxNodeTypes.Slide: return new Slide(sourceNodes, offset);
        }
        return null!;
    }
}
export class Hammer extends NoteConnector { getType() { return SyntaxNodeTypes.Hammer } }
export class Pull extends NoteConnector { getType() { return SyntaxNodeTypes.Pull } }
export class Slide extends NoteConnector { getType() { return SyntaxNodeTypes.Slide } }

export abstract class NoteDecorator extends ASTNode implements SingleSpanNode {
    abstract getType(): string;
    public getRootNodeTraverser(): AnchoredSyntaxCursor {
        return new AnchoredSyntaxCursor(this.sourceNodes[this.getType()][0], this.offset);
    }
    protected createChildren(): ASTNode[] {
        let note = this.sourceNodes[this.getType()][0].getChild(SyntaxNodeTypes.Note);
        if (!note) return [];
        return [Note.from(note.name, {[note.name]: [note]}, this.offset)];
    }
    static from(type: string, sourceNodes: {[type:string]:SyntaxNode[]}, offset: number): NoteDecorator {
        switch(type) {
            case SyntaxNodeTypes.Grace: return new Grace(sourceNodes, offset);
            case SyntaxNodeTypes.Harmonic: return new Harmonic(sourceNodes, offset);
        }
        return null!;
    }
}
export class Grace extends NoteDecorator { getType() { return SyntaxNodeTypes.Grace } }
export class Harmonic extends NoteDecorator { getType() { return SyntaxNodeTypes.Harmonic } }

export abstract class Note extends ASTNode  implements SingleSpanNode {
    abstract getType(): string;
    protected createChildren() { return [] }
    public getRootNodeTraverser(): AnchoredSyntaxCursor {
        return new AnchoredSyntaxCursor(this.sourceNodes[this.getType()][0], this.offset);
    }
    static from(type: string, sourceNodes: {[type:string]:SyntaxNode[]}, offset: number): Note {
        switch(type) {
            case SyntaxNodeTypes.Fret: return new Fret(sourceNodes, offset);
        }
        return null!;
    }
}
export class Fret extends Note { getType(): string { return SyntaxNodeTypes.Fret } }

// modifiers
abstract class Modifier extends ASTNode  implements SingleSpanNode {
    abstract getType(): string;
    public getRootNodeTraverser(): AnchoredSyntaxCursor {
        return new AnchoredSyntaxCursor(this.sourceNodes[this.getType()][0], this.offset);
    }
    protected createChildren(): ASTNode[] {
        return [];
    }
    static from(type: string, sourceNodes: {[type:string]:SyntaxNode[]}, offset: number): Modifier {
        switch(type) {
            case SyntaxNodeTypes.Repeat: return new Repeat(sourceNodes, offset);
            case SyntaxNodeTypes.TimeSignature: return new TimeSignature(sourceNodes, offset);
            case SyntaxNodeTypes.Multiplier: return new Multiplier(sourceNodes, offset);
            default: return null;
        }
    }
}
class Repeat extends Modifier { getType() { return SyntaxNodeTypes.Repeat } }
class TimeSignature extends Modifier { getType() { return SyntaxNodeTypes.TimeSignature } }
class Multiplier extends Modifier { getType(): string { return SyntaxNodeTypes.Multiplier } }