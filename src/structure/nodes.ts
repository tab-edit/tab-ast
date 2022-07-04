import { SyntaxNode } from "@lezer/common";
import { FragmentCursor, SourceCursor } from "./cursors";
import { ASTNode, GroupedNodeList } from "./node-generator";

/**
 * enum values for syntax nodes from the tab-edit/parser-tablature package. (should probably be defined in that package instead.)
 */
export enum SourceNodeTypes {
    Top = "Tablature",
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
        return new SourceCursor(this.node);
    }
}

export class FixedASTNode {
    /**
     * This is the interface through which external clients interact wtih an ASTNode.
     * To be able to support fragment reuse (for incremental parsing),
     * ASTNodes are created in a way such that their ranges are relative to 
     * the fragment within which they exist. This class fixes their position
     * to be absolute (a.k.a relative to the start of the source text)
     * 
     * This interface must be as "immutable" as possible to prevent any possible user 
     * modification of an instance from persisting
     */
    get name() { return this.node.name }
    constructor(
        /**
         * Node to be resolved 
         */
        private node: ASTNode,
        /**
         * A fragment cursor pointing to the provided anchoredNode
         */
        private fragmentCursor: FragmentCursor
    ) {
        this.fragmentCursor = fragmentCursor.fork();
    }
    cursor() { this.fragmentCursor.fork(); }
    // caches
    private _sourceNodes: GroupedNodeList;
    sourceNodes() {
        this.node.sourceNodes
    }
    /**
     * returns the source syntax nodes from which the ASTNode that this class wraps was derived. 
     * The positions of all the source nodes are offset in order to be relative to the start of 
     * the source text, not relative to the start of the fragment it belongs to.
     * @returns a grouped list of source nodes from which this node was derived
     */
    sourceSyntaxNodes() { 
        if (this._sourceNodes) return this._sourceNodes;
        this._sourceNodes = {}
        Object.keys(this.node.sourceNodes).forEach((type) => {
            this._sourceNodes[type] = this.node.sourceNodes[type].map(node => {
                return node.createOffsetCopy(this.fragmentCursor.fragment.from);
            })
        })
        return this._sourceNodes;
    }

    firstChild() {
        const cursor = this.fragmentCursor.fork();
        if (!cursor.firstChild()) return null;
        return new FixedASTNode(cursor.node.node, cursor);
    }
    getChildren(): FixedASTNode[] {
        const cursor = this.fragmentCursor.fork();
        if (!cursor.firstChild()) return []
        const children: FixedASTNode[] = [];
        do {
            children.push(new FixedASTNode(cursor.node.node, cursor));
        } while (cursor.nextSibling());
        return children;
    }
    nextSibling() {
        const cursor = this.fragmentCursor.fork();
        if (!cursor.nextSibling()) return null;
        return new FixedASTNode(cursor.node.node, cursor);
    }
    prevSibling() {
        const cursor = this.fragmentCursor.fork();
        if (!cursor.prevSibling()) return null;
        return new FixedASTNode(cursor.node.node, cursor);
    }
    parent() {
        const cursor = this.fragmentCursor.fork();
        if (!cursor.parent()) return null;
        return new FixedASTNode(cursor.node.node, cursor);
    }

    getAncestors() {
        const cursor = this.fragmentCursor.fork();
        const ancestors:FixedASTNode[] = [];
        while (cursor.parent()) {
            ancestors.push(cursor.node);
        }
        return ancestors.reverse();
    }
}
