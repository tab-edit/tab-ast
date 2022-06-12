import { Text } from "@codemirror/state";
import { SyntaxNode, TreeCursor } from "@lezer/common";
import objectHash from "object-hash";
import { AnchoredSyntaxCursor, FragmentCursor } from "./cursors";
import { TabFragment } from "./fragment";

/**
 * enum values for syntax nodes from the tab-edit/parser-tablature package. (should probably be defined in that package instead.)
 */
export enum SourceNodeTypes {
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
    Component = "Component",
    Connector = "Connector",

    RepeatLine = "RepeatLine",
    Repeat = "Repeat",
    Multiplier = "Multiplier",
    TimeSignature = "TimeSignature",
    TimeSigLine = "TimeSigLine",
    TimingLine = "TimingLine",

    Modifier = "Modifier",
    
    InvalidToken = "⚠"
}

export enum ASTNodeTypes {
    TabSegment = "TabSegment",
    TabBlock = "TabBlock",
    Measure = "Measure",
    Sound = "Sound",
    MeasureLineName = "MeasureLineName",
    LineNaming = "LineNaming",
    Hammer = "Hammer",
    Pull = "Pull",
    Slide = "Slide",
    Grace = "Grace",
    Harmonic = "Harmonic",
    Fret = "Fret",
    Repeat = "Repeat",
    TimeSignature = "TimeSignature",
    Multiplier = "Multiplier",
    ConnectorGroup = "ConnectorGroup",
    Component = "Component",
    Connector = "Connector"
}

 /**
 * a wrapper class around the SyntaxNode object, but 
 * whose ranges/positions are all relative to a given 
 * anchor position.
 */
export class SourceNode {
    constructor(
        private node: SyntaxNode, 
        private anchorPos: number
    ) {}

    get type() { return this.node.type }
    get name() { return this.node.name }
    get from() { return this.node.from - this.anchorPos }
    get to() { return this.node.to - this.anchorPos }

    getChild(type: string | number) {
        return new SourceNode(this.node.getChild(type), this.anchorPos);
    }
    getChildren(type: string | number) {
        return this.node.getChildren(type).map((node) => new SourceNode(node, this.anchorPos));
    }
    createOffsetCopy(offset: number) {
        return new SourceNode(this.node, this.anchorPos+offset);
    }
    get cursor() {
        return new AnchoredSyntaxCursor(this.node, this.anchorPos);
    }
}

/**
 * Interface through which external clients interact with an ASTNode.
 * To be able to support fragment reuse (for incremental parsing),
 * AnchoredASTNode's range values are relative to the fragment in which
 * they reside. A ResolvedASTNode object on the other hand maps an
 * AnchoredASTNode's relative range value onto an absolute value, which
 * maps directly onto the source text.
 */
export class ResolvedASTNode {
    get name() { return this.anchoredNode.name }
    constructor(
        /**
         * Node to be resolved 
         */
        private anchoredNode: AnchoredASTNode,
        /**
         * A fragment cursor pointing to the provided anchoredNode
         */
        private fragmentCursor: FragmentCursor
    ) {
        this.fragmentCursor = fragmentCursor.fork();
    }
    cursor() { this.fragmentCursor.fork(); }
    // caches
    private _ranges: number[];
    private _sourceSyntaxNodes:{[type:string]: SourceNode[]};
    private _hash: string;
    get ranges() {
        if (!this._ranges) this._ranges = this.anchoredNode.ranges.map(rng => this.fragmentCursor.fragment.from+rng);
        return this._ranges;
    }
    /**
     * returns the source syntax nodes that make up the ASTNode at the current cursor position.
     * Unlike in AnchoredASTNode.sourceSyntaxNodes or FragmentCursor.sourceSyntaxNodes(), the
     * returned nodes are anchored to the start of the document, so their ranges will directly
     * correspond to the position in the source text which they cover
     * @returns 
     */
    sourceSyntaxNodes() { 
        if (this._sourceSyntaxNodes) return this._sourceSyntaxNodes;
        const fragmentAnchoredSourceNode = this.anchoredNode.getSourceSyntaxNodes();
        this._sourceSyntaxNodes = {}
        Object.keys(fragmentAnchoredSourceNode).forEach((type) => {
            this._sourceSyntaxNodes[type] = fragmentAnchoredSourceNode[type].map(node => {
                return node.createOffsetCopy(this.fragmentCursor.fragment.from);
            })
        })
        return this._sourceSyntaxNodes;
    }

    /**
     * Generates a hash for this node. This hash is unique for every node
     * in the abstract syntax tree of the source text.
     * @returns a string hash for the node
     */
    hash() { 
        if (!this._hash) this._hash = objectHash([this.anchoredNode.hash(), this.fragmentCursor.fragment.from])
        return this._hash;
    }

    firstChild() {
        const cursor = this.fragmentCursor.fork();
        if (!cursor.firstChild()) return null;
        return new ResolvedASTNode(cursor.node.anchoredNode, cursor);
    }
    getChildren(): ResolvedASTNode[] {
        const cursor = this.fragmentCursor.fork();
        if (!cursor.firstChild()) return []
        const children: ResolvedASTNode[] = [];
        do {
            children.push(new ResolvedASTNode(cursor.node.anchoredNode, cursor));
        } while (cursor.nextSibling());
        return children;
    }
    nextSibling() {
        const cursor = this.fragmentCursor.fork();
        if (!cursor.nextSibling()) return null;
        return new ResolvedASTNode(cursor.node.anchoredNode, cursor);
    }
    prevSibling() {
        const cursor = this.fragmentCursor.fork();
        if (!cursor.prevSibling()) return null;
        return new ResolvedASTNode(cursor.node.anchoredNode, cursor);
    }
    parent() {
        const cursor = this.fragmentCursor.fork();
        if (!cursor.parent()) return null;
        return new ResolvedASTNode(cursor.node.anchoredNode, cursor);
    }

    getAncestors() {
        const cursor = this.fragmentCursor.fork();
        const ancestors:ResolvedASTNode[] = [];
        while (cursor.parent()) {
            ancestors.push(cursor.node);
        }
        return ancestors.reverse();
    }
}


/**
 * ASTNode whose ranges are relative to an anchor position. 
 * (useful when reusing fragments at different positions in the 
 * text - we don't need to recompute the ranges of all its ASTNodes 
 * as the ranges are relative to whatever TabFragment they are in)
 */
export abstract class AnchoredASTNode {
    get name() { return this.constructor.name; }
    constructor(
        /// The Syntax Node objects that make up this ASTNode, organized by type
        protected sourceNodes: {[type:string]:SyntaxNode[]},
        readonly anchorPos: number
    ) {}


    // parse up-keep
    private parsed = false;
    get isParsed() { return this.parsed }
    public parse(sourceText: Text): AnchoredASTNode[] {
        if (this.parsed) return [];
        this.parsed = true;
        return this.createChildren(sourceText);
    }
    protected abstract createChildren(sourceText: Text): AnchoredASTNode[];
    
    /// the length that this node and all of its children take up in 
    /// their source array when being parsed by the LinearParser
    /// (ideally this logic should be represented in the LinearParser 
    /// class somehow, not here)
    private _length = 1;
    public increaseLength(children: AnchoredASTNode[]) { this._length += children.length }
    get length() { return this._length; }

    private _ranges:number[];
    get ranges() {
        if (this._ranges) return this._ranges;
        let rngs:number[] = []
        for (let name in this.sourceNodes) {
            for (let node of this.sourceNodes[name]) {
                rngs.push(node.from-this.anchorPos);
                rngs.push(node.to-this.anchorPos);
            }
        }
        this._ranges = rngs;
        return rngs;
    }



    private _sourceSyntaxNodes: {[type:string]: SourceNode[]}
    /**
     * Generates a list of anchored syntax nodes from which this 
     * AnchoredASTNode was parsed. This list is grouped by the syntax node types
     * @returns a type-grouped list of AnchoredSyntaxNode objects
     */
    public getSourceSyntaxNodes(): {[type:string]: SourceNode[]} {
        if (this._sourceSyntaxNodes) return this._sourceSyntaxNodes;
        this._sourceSyntaxNodes = {}
        Object.keys(this.sourceNodes).forEach((type) => {
            this._sourceSyntaxNodes[type] = this.sourceNodes[type].map(node => {
                return new SourceNode(node, node.from-this.anchorPos);
            })
        })
        return this._sourceSyntaxNodes;
    }

    private _hash:string;
    /**
     * generates a hash for the AnchoredASTNode from its name and ranges
     * @returns a string hash for the node
     */
    hash() {
        if (!this._hash) this._hash = objectHash([this.name, ...this.ranges]);
        return this._hash;
    }
}


export class TabSegment extends AnchoredASTNode {
    protected createChildren(sourceText: Text): TabBlock[] {
        let modifiers = this.sourceNodes[SourceNodeTypes.TabSegment][0].getChildren(SourceNodeTypes.Modifier);

        let strings:SyntaxNode[][] = [];
        for (let line of this.sourceNodes[SourceNodeTypes.TabSegment][0].getChildren(SourceNodeTypes.TabSegmentLine)) {
            strings.push(line.getChildren(SourceNodeTypes.TabString).reverse()); //reversed for efficiency in performing remove operations
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
                    [SourceNodeTypes.Modifier]: blockModifiers[bI] || [],
                    [SourceNodeTypes.TabString]: blocks[bI]
                },
                this.anchorPos
            ));
        }
        
        return tabBlocks;
    }

    private lineDistance(idx: number, sourceText: Text) {
        return idx - sourceText.lineAt(idx).from;
    }
}

export class TabBlock extends AnchoredASTNode {
    protected createChildren() {
        let result: AnchoredASTNode[] = [];

        let modifiers = this.sourceNodes[SourceNodeTypes.Modifier];
        for (let mod of modifiers) {
            result.push(Modifier.from(mod.name, {[mod.name]: [mod]}, this.anchorPos))
        }

        let strings = this.sourceNodes[SourceNodeTypes.TabString];

        let measureLineNames: SyntaxNode[] = [];
        let measures: SyntaxNode[][] = [];
        for (let string of strings) {
            // make sure multiplier is inserted as a child before all measures so it is traversed first
            let multiplier = string.getChild(SourceNodeTypes.Multiplier);
            if (multiplier) result.push(Modifier.from(multiplier.name, {[multiplier.name]: [multiplier]}, this.anchorPos));

            let mlineName = string.getChild(SourceNodeTypes.MeasureLineName);
            if (mlineName) measureLineNames.push(mlineName);
            let measurelines = string.getChildren(SourceNodeTypes.MeasureLine);
            for (let i=0; i<measurelines.length; i++) {
                if (!measures[i]) measures[i] = [];
                measures[i].push(measurelines[i]);
            }
        }

        result.push(new LineNaming({[SourceNodeTypes.MeasureLineName]: measureLineNames}, this.anchorPos));
        for (let i=0; i<measures.length; i++) {
            result.push(new Measure({[SourceNodeTypes.MeasureLine]: measures[i]}, this.anchorPos))
        }
        return result;
    }
}

export class Measure extends AnchoredASTNode {
    protected createChildren(sourceText: Text): Sound[] {
        let lines = this.sourceNodes[SourceNodeTypes.MeasureLine];
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
                if (cursorCopy.type.is(SourceNodeTypes.Note) || cursorCopy.type.is(SourceNodeTypes.NoteDecorator)) {
                    measureComponentsByLine[i].push(cursorCopy.node);
                    if (cursorCopy.type.is(SourceNodeTypes.NoteDecorator)) {
                        mcAnchors[i].push(this.charDistance(line.from, (cursorCopy.node.getChild(SourceNodeTypes.Note)?.from || cursorCopy.from), sourceText));
                    } else mcAnchors[i].push(this.charDistance(line.from, cursorCopy.from, sourceText));
                    if (connectorRecursionRoot!=null) {
                        cursorCopy = connectorRecursionRoot;
                        connectorRecursionRoot = null;
                    }
                    continue;
                }
                if (!cursorCopy.node.type.is(SourceNodeTypes.NoteConnector)) break;
                if (!connectorRecursionRoot) connectorRecursionRoot = cursorCopy.node.cursor();
                measureComponentsByLine[i].push(cursorCopy.node);
                let connector = cursorCopy.node;
                let firstNote = connector.getChild(SourceNodeTypes.Note) || connector.getChild(SourceNodeTypes.NoteDecorator);
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
            result.push(new Sound({MultiType: sound}, this.anchorPos))
        }

        return result;
    }

    private charDistance(from: number, to: number, sourceText: Text) {
        return sourceText.slice(from, to).toString().replace(/\s/g, '').length;
    }
}

export class Sound extends AnchoredASTNode {
    protected createChildren() {
        let components = this.sourceNodes.MultiType; // TODO: MultiType does not correspond to any node in the Syntax Tree. Think of a better way to transfer this data
        let result: AnchoredASTNode[] = [];
        for (let component of components) {
            if (component.type.is(SourceNodeTypes.Note)) result.push(Note.from(component.name, {[component.name]: [component]}, this.anchorPos));
            else if (component.type.is(SourceNodeTypes.NoteDecorator)) result.push(NoteDecorator.from(component.name, {[component.name]: [component]}, this.anchorPos));
            else if (component.type.is(SourceNodeTypes.NoteConnector)) result.push(NoteConnector.from(component.name, {[component.name]: [component]}, this.anchorPos));
        }

        return result;
    }
}

class MeasureLineName extends AnchoredASTNode {
    protected createChildren() { return [] } 
}
class LineNaming extends AnchoredASTNode {
    protected createChildren(): MeasureLineName[] {
        let names = this.sourceNodes[SourceNodeTypes.MeasureLineName];
        return names.map((name) => new MeasureLineName({[SourceNodeTypes.MeasureLineName]: [name]}, this.anchorPos));
    }
}

export abstract class NoteConnector extends AnchoredASTNode {
    abstract getType(): string;
    private notes: SyntaxNode[];
    
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
            if (cursor.type.is(SourceNodeTypes.Note) || cursor.type.is(SourceNodeTypes.NoteDecorator)) {
                notes.push(cursor.node);
                if (nestedConnectorExit) {
                    cursor = nestedConnectorExit.cursor();
                    nestedConnectorExit = null;
                }
            } else if (cursor.type.is(SourceNodeTypes.NoteConnector)) {
                nestedConnectorExit = cursor.node;
                cursor.firstChild();
            }
        } while (cursor.nextSibling());
        return notes;
    }

    protected createChildren() { return this.notes.map((node) => Note.from(node.name, {[node.name]: [node]}, this.anchorPos)); }
    
    static isNoteConnector(name: string) { return name in [SourceNodeTypes.Hammer, SourceNodeTypes.Pull, SourceNodeTypes.Slide] }

    static from(type: string, sourceNodes: {[type:string]:SyntaxNode[]}, offset: number): NoteConnector {
        switch(type) {
            case SourceNodeTypes.Hammer: return new Hammer(sourceNodes, offset);
            case SourceNodeTypes.Pull: return new Pull(sourceNodes, offset);
            case SourceNodeTypes.Slide: return new Slide(sourceNodes, offset);
        }
        throw new Error(`Invalid NoteConnector type "${type}"`);
    }
}
export class Hammer extends NoteConnector { getType() { return SourceNodeTypes.Hammer } }
export class Pull extends NoteConnector { getType() { return SourceNodeTypes.Pull } }
export class Slide extends NoteConnector { getType() { return SourceNodeTypes.Slide } }

export abstract class NoteDecorator extends AnchoredASTNode {
    abstract getType(): string;
    protected createChildren(): AnchoredASTNode[] {
        let note = this.sourceNodes[this.getType()][0].getChild(SourceNodeTypes.Note);
        if (!note) return [];
        return [Note.from(note.name, {[note.name]: [note]}, this.anchorPos)];
    }
    static from(type: string, sourceNodes: {[type:string]:SyntaxNode[]}, offset: number): NoteDecorator {
        switch(type) {
            case SourceNodeTypes.Grace: return new Grace(sourceNodes, offset);
            case SourceNodeTypes.Harmonic: return new Harmonic(sourceNodes, offset);
        }
        throw new Error(`Invalid NoteDecorator type "${type}"`);
    }
}
export class Grace extends NoteDecorator { getType() { return SourceNodeTypes.Grace } }
export class Harmonic extends NoteDecorator { getType() { return SourceNodeTypes.Harmonic } }

export abstract class Note extends AnchoredASTNode {
    abstract getType(): string;
    protected createChildren() { return [] }
    static from(type: string, sourceNodes: {[type:string]:SyntaxNode[]}, offset: number): Note {
        switch(type) {
            case SourceNodeTypes.Fret: return new Fret(sourceNodes, offset);
        }
        throw new Error(`Invalid Note type "${type}"`);
    }
}
export class Fret extends Note { getType(): string { return SourceNodeTypes.Fret } }

// modifiers
abstract class Modifier extends AnchoredASTNode {
    abstract getType(): string;
    protected createChildren(): AnchoredASTNode[] {
        return [];
    }
    static from(type: string, sourceNodes: {[type:string]:SyntaxNode[]}, offset: number): Modifier {
        switch(type) {
            case SourceNodeTypes.Repeat: return new Repeat(sourceNodes, offset);
            case SourceNodeTypes.TimeSignature: return new TimeSignature(sourceNodes, offset);
            case SourceNodeTypes.Multiplier: return new Multiplier(sourceNodes, offset);
        }
        throw new Error(`Invalid Modifier type "${type}"`);
    }
}
class Repeat extends Modifier { getType() { return SourceNodeTypes.Repeat } }
class TimeSignature extends Modifier { getType() { return SourceNodeTypes.TimeSignature } }
class Multiplier extends Modifier { getType(): string { return SourceNodeTypes.Multiplier } }


