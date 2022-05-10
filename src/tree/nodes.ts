import { Text } from "@codemirror/state";
import { SyntaxNode, TreeCursor } from "@lezer/common";
import { AnchoredSyntaxCursor, OffsetSyntaxNode } from "./cursors";
import objectHash from "object-hash";

export enum SourceSyntaxNodeTypes {
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

export abstract class ASTNode {
    public get isSingleSpanNode() { return typeof (this as any).getRootNodeTraverser === "function" }
    readonly ranges: Uint16Array; // TODO: Does this really need to be Uint16Array? why not a normal array. memory benefit might be little to none
    constructor(
        /// mapping of SyntaxNode type => syntax nodes where the syntax nodes are the source
        /// nodes of the parse tree from which the ASTNode is being built.
        /// currently, once i lazily parse only once, i dispose of sourceNodes (set to null) for efficiency(TODO: i might remove this feature as it might not be a good idea to dispose)
        protected sourceNodes: {[type:string]:OffsetSyntaxNode[]},
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
    
    // the length an ASTNode and all its children take up in their source array
    private _length = 1;
    public increaseLength(children: ASTNode[]) { this._length += children.length }
    get length() { return this._length; }


    protected computeRanges(sourceNodes: {[type:string]:OffsetSyntaxNode[]}, offset: number): number[] {
        let rngs:number[] = []
        for (let name in sourceNodes) {
            for (let node of sourceNodes[name]) {
                rngs.push(node.from-offset);
                rngs.push(node.to-offset);
            }
        }
        return rngs;
    }
     /**
     * Generates a hash for the node. This hash is generated using the node's 
     * name, as well as the ranges the node covers relative to the offset 
     * initially provided in this class' constructor.
     * Only safe to use when you know what you're doing. If you want to get a hash for a node 
     * in your TabTree, look at the FragmentCursor.nodeHash() function
     * @returns a string hash for the node
     */
    hash() {
        return objectHash([this.name, ...this.ranges])
    }


    get sourceSyntaxNodes() { return this.sourceNodes }
}


export class TabSegment extends ASTNode {
    protected createChildren(sourceText: Text): TabBlock[] {
        let modifiers = this.sourceNodes[SourceSyntaxNodeTypes.TabSegment][0].getChildren(SourceSyntaxNodeTypes.Modifier);

        let strings:OffsetSyntaxNode[][] = [];
        for (let line of this.sourceNodes[SourceSyntaxNodeTypes.TabSegment][0].getChildren(SourceSyntaxNodeTypes.TabSegmentLine)) {
            strings.push(line.getChildren(SourceSyntaxNodeTypes.TabString).reverse()); //reversed for efficiency in performing remove operations
        }

        let blocks:OffsetSyntaxNode[][] = [] //each array of syntax node is a block
        let blockAnchors:{to: number, from: number}[] = [];

        let string:OffsetSyntaxNode, stringLine:OffsetSyntaxNode[], bI: number, isStringPlaced:boolean, anchor:{to: number, from: number}; // variables used in inner loops, but defined outside loop for efficiency
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
        let blockModifiers:OffsetSyntaxNode[][] = [];
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
                    [SourceSyntaxNodeTypes.Modifier]: blockModifiers[bI] || [],
                    [SourceSyntaxNodeTypes.TabString]: blocks[bI]
                },
                this.offset
            ));
        }
        
        return tabBlocks;
    }

    private lineDistance(idx: number, sourceText: Text) {
        return idx - sourceText.lineAt(idx).from;
    }
}

export class TabBlock extends ASTNode {
    protected createChildren() {
        let result: ASTNode[] = [];

        let modifiers = this.sourceNodes[SourceSyntaxNodeTypes.Modifier];
        for (let mod of modifiers) {
            result.push(Modifier.from(mod.name, {[mod.name]: [mod]}, this.offset))
        }

        let strings = this.sourceNodes[SourceSyntaxNodeTypes.TabString];

        let measureLineNames: OffsetSyntaxNode[] = [];
        let measures: OffsetSyntaxNode[][] = [];
        for (let string of strings) {
            // make sure multiplier is inserted as a child before all measures so it is traversed first
            let multiplier = string.getChild(SourceSyntaxNodeTypes.Multiplier);
            if (multiplier) result.push(Modifier.from(multiplier.name, {[multiplier.name]: [multiplier]}, this.offset));

            let mlineName = string.getChild(SourceSyntaxNodeTypes.MeasureLineName);
            if (mlineName) measureLineNames.push(mlineName);
            let measurelines = string.getChildren(SourceSyntaxNodeTypes.MeasureLine);
            for (let i=0; i<measurelines.length; i++) {
                if (!measures[i]) measures[i] = [];
                measures[i].push(measurelines[i]);
            }
        }

        result.push(new LineNaming({[SourceSyntaxNodeTypes.MeasureLineName]: measureLineNames}, this.offset));
        for (let i=0; i<measures.length; i++) {
            result.push(new Measure({[SourceSyntaxNodeTypes.MeasureLine]: measures[i]}, this.offset))
        }
        return result;
    }
}

export class Measure extends ASTNode {
    protected createChildren(sourceText: Text): Sound[] {
        let lines = this.sourceNodes[SourceSyntaxNodeTypes.MeasureLine];
        let measureComponentsByLine: OffsetSyntaxNode[][] = [];
        let mcAnchors: number[][] = [];
        for (let i=0; i<lines.length; i++) {
            let line = lines[i];
            measureComponentsByLine[i] = [];
            mcAnchors[i] = [];
            let cursor = line.cursor();
            if (!cursor.firstChild()) continue;
            let cursorCopy = cursor.node.cursor();
            let connectorRecursionRoot: AnchoredSyntaxCursor | null = null;
            do {
                if (cursorCopy.type.is(SourceSyntaxNodeTypes.Note) || cursorCopy.type.is(SourceSyntaxNodeTypes.NoteDecorator)) {
                    measureComponentsByLine[i].push(cursorCopy.node);
                    if (cursorCopy.type.is(SourceSyntaxNodeTypes.NoteDecorator)) {
                        mcAnchors[i].push(this.charDistance(line.from, (cursorCopy.node.getChild(SourceSyntaxNodeTypes.Note)?.from || cursorCopy.from), sourceText));
                    } else mcAnchors[i].push(this.charDistance(line.from, cursorCopy.from, sourceText));
                    if (connectorRecursionRoot!=null) {
                        cursorCopy = connectorRecursionRoot;
                        connectorRecursionRoot = null;
                    }
                    continue;
                }
                if (!cursorCopy.node.type.is(SourceSyntaxNodeTypes.NoteConnector)) break;
                if (!connectorRecursionRoot) connectorRecursionRoot = cursorCopy.node.cursor();
                measureComponentsByLine[i].push(cursorCopy.node);
                let connector = cursorCopy.node;
                let firstNote = connector.getChild(SourceSyntaxNodeTypes.Note) || connector.getChild(SourceSyntaxNodeTypes.NoteDecorator);
                if (firstNote) {
                    mcAnchors[i].push(this.charDistance(line.from, firstNote.from, sourceText));
                    cursorCopy = firstNote.cursor();
                } else {
                    mcAnchors[i].push(this.charDistance(line.from, connector.from, sourceText));
                }
            } while (cursorCopy.nextSibling());
        }

        // similar concept used in grouping TabStrings to make TabBlocks in the TabSegment.createChildren() class
        let sounds: OffsetSyntaxNode[][] = [];
        let soundAnchors: number[] = [];
        let componentPointers: number[] = new Array(lines.length).fill(0);

        let component: OffsetSyntaxNode, componentAnchor: number, soundIdx: number, hasGroupedAllSounds: boolean, isComponentPlaced: boolean;
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
            if (component.type.is(SourceSyntaxNodeTypes.Note)) result.push(Note.from(component.name, {[component.name]: [component]}, this.offset));
            else if (component.type.is(SourceSyntaxNodeTypes.NoteDecorator)) result.push(NoteDecorator.from(component.name, {[component.name]: [component]}, this.offset));
            else if (component.type.is(SourceSyntaxNodeTypes.NoteConnector)) result.push(NoteConnector.from(component.name, {[component.name]: [component]}, this.offset));
        }

        return result;
    }
}

class MeasureLineName extends ASTNode {
    protected createChildren() { return [] } 
}
class LineNaming extends ASTNode {
    protected createChildren(): MeasureLineName[] {
        let names = this.sourceNodes[SourceSyntaxNodeTypes.MeasureLineName];
        return names.map((name) => new MeasureLineName({[SourceSyntaxNodeTypes.MeasureLineName]: [name]}, this.offset));
    }
}

export abstract class NoteConnector extends ASTNode {
    abstract getType(): string;
    private notes: OffsetSyntaxNode[];
    
    // the raw parser parses note connectors recursively, so 5h3p2 would
    // parse as Hammer(5, Pull(3,2)), making the hammeron encompass also the fret 2
    // but the hammer relationship only connects 5 and 3, so we override the range computation to
    // reflect this fact.
    protected computeRanges(sourceNodes: { [type: string]: OffsetSyntaxNode[]; }, offset: number): any[] {
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

    private getNotesFromNoteConnector(connector: OffsetSyntaxNode) {
        let notes:OffsetSyntaxNode[] = [];
        let cursor = connector.cursor();
        let nestedConnectorExit: OffsetSyntaxNode | null = null;
        if (!cursor.firstChild()) return [];
        do {
            if (cursor.type.is(SourceSyntaxNodeTypes.Note) || cursor.type.is(SourceSyntaxNodeTypes.NoteDecorator)) {
                notes.push(cursor.node);
                if (nestedConnectorExit) {
                    cursor = nestedConnectorExit.cursor();
                    nestedConnectorExit = null;
                }
            } else if (cursor.type.is(SourceSyntaxNodeTypes.NoteConnector)) {
                nestedConnectorExit = cursor.node;
                cursor.firstChild();
            }
        } while (cursor.nextSibling());
        return notes;
    }

    protected createChildren() { return this.notes.map((node) => Note.from(node.name, {[node.name]: [node]}, this.offset)); }
    
    static isNoteConnector(name: string) { return name in [SourceSyntaxNodeTypes.Hammer, SourceSyntaxNodeTypes.Pull, SourceSyntaxNodeTypes.Slide] }

    static from(type: string, sourceNodes: {[type:string]:OffsetSyntaxNode[]}, offset: number): NoteConnector {
        switch(type) {
            case SourceSyntaxNodeTypes.Hammer: return new Hammer(sourceNodes, offset);
            case SourceSyntaxNodeTypes.Pull: return new Pull(sourceNodes, offset);
            case SourceSyntaxNodeTypes.Slide: return new Slide(sourceNodes, offset);
        }
        throw new Error(`Invalid NoteConnector type "${type}"`);
    }
}
export class Hammer extends NoteConnector { getType() { return SourceSyntaxNodeTypes.Hammer } }
export class Pull extends NoteConnector { getType() { return SourceSyntaxNodeTypes.Pull } }
export class Slide extends NoteConnector { getType() { return SourceSyntaxNodeTypes.Slide } }

export abstract class NoteDecorator extends ASTNode {
    abstract getType(): string;
    protected createChildren(): ASTNode[] {
        let note = this.sourceNodes[this.getType()][0].getChild(SourceSyntaxNodeTypes.Note);
        if (!note) return [];
        return [Note.from(note.name, {[note.name]: [note]}, this.offset)];
    }
    static from(type: string, sourceNodes: {[type:string]:OffsetSyntaxNode[]}, offset: number): NoteDecorator {
        switch(type) {
            case SourceSyntaxNodeTypes.Grace: return new Grace(sourceNodes, offset);
            case SourceSyntaxNodeTypes.Harmonic: return new Harmonic(sourceNodes, offset);
        }
        throw new Error(`Invalid NoteDecorator type "${type}"`);
    }
}
export class Grace extends NoteDecorator { getType() { return SourceSyntaxNodeTypes.Grace } }
export class Harmonic extends NoteDecorator { getType() { return SourceSyntaxNodeTypes.Harmonic } }

export abstract class Note extends ASTNode {
    abstract getType(): string;
    protected createChildren() { return [] }
    static from(type: string, sourceNodes: {[type:string]:OffsetSyntaxNode[]}, offset: number): Note {
        switch(type) {
            case SourceSyntaxNodeTypes.Fret: return new Fret(sourceNodes, offset);
        }
        throw new Error(`Invalid Note type "${type}"`);
    }
}
export class Fret extends Note { getType(): string { return SourceSyntaxNodeTypes.Fret } }

// modifiers
abstract class Modifier extends ASTNode {
    abstract getType(): string;
    protected createChildren(): ASTNode[] {
        return [];
    }
    static from(type: string, sourceNodes: {[type:string]:OffsetSyntaxNode[]}, offset: number): Modifier {
        switch(type) {
            case SourceSyntaxNodeTypes.Repeat: return new Repeat(sourceNodes, offset);
            case SourceSyntaxNodeTypes.TimeSignature: return new TimeSignature(sourceNodes, offset);
            case SourceSyntaxNodeTypes.Multiplier: return new Multiplier(sourceNodes, offset);
        }
        throw new Error(`Invalid Modifier type "${type}"`);
    }
}
class Repeat extends Modifier { getType() { return SourceSyntaxNodeTypes.Repeat } }
class TimeSignature extends Modifier { getType() { return SourceSyntaxNodeTypes.TimeSignature } }
class Multiplier extends Modifier { getType(): string { return SourceSyntaxNodeTypes.Multiplier } }