import * as _codemirror_state from '@codemirror/state';
import { Text, EditorState, Facet, Extension, StateField, ChangeDesc, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import * as _lezer_common from '@lezer/common';
import { SyntaxNode, ChangedRange } from '@lezer/common';

interface Cursor<T> {
    name: string;
    node: Readonly<T>;
    firstChild(): boolean;
    lastChild(): boolean;
    parent(): boolean;
    prevSibling(): boolean;
    nextSibling(): boolean;
    fork(): Cursor<T>;
}
declare class TabTreeCursor implements Cursor<ResolvedASTNode> {
    private fragSet;
    private pointer;
    private currentCursor;
    private constructor();
    static from(fragSet: TabFragment[], startingPos?: number): TabTreeCursor;
    get name(): string;
    get node(): ResolvedASTNode;
    getAncestors(): FragmentCursor;
    firstChild(): boolean;
    lastChild(): boolean;
    parent(): boolean;
    prevSibling(): boolean;
    nextSibling(): boolean;
    fork(): TabTreeCursor;
}
declare class FragmentCursor implements Cursor<ResolvedASTNode> {
    readonly fragment: TabFragment;
    private ancestryTrace;
    private pointer;
    constructor(fragment: TabFragment);
    get name(): string;
    get node(): ResolvedASTNode;
    getAncestors(): ResolvedASTNode[];
    firstChild(): boolean;
    lastChild(): boolean;
    parent(): boolean;
    prevSibling(): boolean;
    nextSibling(): boolean;
    fork(): FragmentCursor;
    static readonly dud: FragmentCursor;
    printTree(): string;
    private printTreeRecursiveHelper;
}
/**
 * Creates a cursor for SyntaxNodes which are anchored to the node provided
 * in the constructor (you can only explore the sub-tree rooted atthe provided
 * starting node, not its siblings or ancestors)
 */
declare class AnchoredSyntaxCursor implements Cursor<SourceNode> {
    private anchorNode;
    private anchorOffset;
    private cursor;
    constructor(anchorNode: SyntaxNode, anchorOffset: number);
    get type(): _lezer_common.NodeType;
    get name(): string;
    get from(): number;
    get to(): number;
    get node(): SourceNode;
    firstChild(): boolean;
    lastChild(): boolean;
    enter(pos: number, side: -1 | 0 | 1): boolean;
    parent(): boolean;
    nextSibling(): boolean;
    prevSibling(): boolean;
    fork(): AnchoredSyntaxCursor;
    private cursorAtAnchor;
}

/**
 * enum values for syntax nodes from the tab-edit/parser-tablature package. (should probably be defined in that package instead.)
 */
declare enum SourceNodeTypes {
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
    InvalidToken = "\u26A0"
}
declare enum ASTNodeTypes {
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
declare class SourceNode {
    private node;
    private anchorPos;
    constructor(node: SyntaxNode, anchorPos: number);
    get type(): _lezer_common.NodeType;
    get name(): string;
    get from(): number;
    get to(): number;
    getChild(type: string | number): SourceNode;
    getChildren(type: string | number): SourceNode[];
    createOffsetCopy(offset: number): SourceNode;
    get cursor(): AnchoredSyntaxCursor;
}
/**
 * Interface through which external clients interact with an ASTNode.
 * To be able to support fragment reuse (for incremental parsing),
 * AnchoredASTNode's range values are relative to the fragment in which
 * they reside. A ResolvedASTNode object on the other hand maps an
 * AnchoredASTNode's relative range value onto an absolute value, which
 * maps directly onto the source text.
 */
declare class ResolvedASTNode {
    /**
     * Node to be resolved
     */
    private anchoredNode;
    /**
     * A fragment cursor pointing to the provided anchoredNode
     */
    private fragmentCursor;
    get name(): string;
    constructor(
    /**
     * Node to be resolved
     */
    anchoredNode: AnchoredASTNode, 
    /**
     * A fragment cursor pointing to the provided anchoredNode
     */
    fragmentCursor: FragmentCursor);
    cursor(): void;
    private _ranges;
    private _sourceSyntaxNodes;
    private _hash;
    get ranges(): number[];
    /**
     * returns the source syntax nodes that make up the ASTNode at the current cursor position.
     * Unlike in AnchoredASTNode.sourceSyntaxNodes or FragmentCursor.sourceSyntaxNodes(), the
     * returned nodes are anchored to the start of the document, so their ranges will directly
     * correspond to the position in the source text which they cover
     * @returns
     */
    sourceSyntaxNodes(): {
        [type: string]: SourceNode[];
    };
    /**
     * Generates a hash for this node. This hash is unique for every node
     * in the abstract syntax tree of the source text.
     * @returns a string hash for the node
     */
    hash(): string;
    firstChild(): ResolvedASTNode;
    getChildren(): ResolvedASTNode[];
    nextSibling(): ResolvedASTNode;
    prevSibling(): ResolvedASTNode;
    parent(): ResolvedASTNode;
    getAncestors(): ResolvedASTNode[];
}
/**
 * ASTNode whose ranges are relative to an anchor position.
 * (useful when reusing fragments at different positions in the
 * text - we don't need to recompute the ranges of all its ASTNodes
 * as the ranges are relative to whatever TabFragment they are in)
 */
declare abstract class AnchoredASTNode {
    protected sourceNodes: {
        [type: string]: SyntaxNode[];
    };
    readonly anchorPos: number;
    get name(): string;
    constructor(sourceNodes: {
        [type: string]: SyntaxNode[];
    }, anchorPos: number);
    private parsed;
    get isParsed(): boolean;
    parse(sourceText: Text): AnchoredASTNode[];
    protected abstract createChildren(sourceText: Text): AnchoredASTNode[];
    private _length;
    increaseLength(children: AnchoredASTNode[]): void;
    get length(): number;
    private _ranges;
    get ranges(): number[];
    private _sourceSyntaxNodes;
    /**
     * Generates a list of anchored syntax nodes from which this
     * AnchoredASTNode was parsed. This list is grouped by the syntax node types
     * @returns a type-grouped list of AnchoredSyntaxNode objects
     */
    getSourceSyntaxNodes(): {
        [type: string]: SourceNode[];
    };
    private _hash;
    /**
     * generates a hash for the AnchoredASTNode from its name and ranges
     * @returns a string hash for the node
     */
    hash(): string;
}

declare class TabTree {
    readonly fragments: TabFragment[];
    readonly from: number;
    readonly to: number;
    constructor(fragments: TabFragment[]);
    get cursor(): TabTreeCursor;
    static createBlankTree(from: number, to: number): TabTree;
    getFragments(): TabFragment[];
    iterate(spec: IteratorSpec): void;
    private iterateHelper;
    static readonly empty: TabTree;
    toString(): string;
}
declare type IteratorSpec = {
    enter: (node: ResolvedASTNode) => false | void;
    leave?: (node: ResolvedASTNode) => void;
    from?: number;
    to?: number;
};

declare class TabFragment {
    readonly from: number;
    readonly to: number;
    static get AnchorNodeType(): SourceNodeTypes;
    readonly isBlankFragment: boolean;
    private linearParser?;
    private constructor();
    private _nodeSet;
    get nodeSet(): AnchoredASTNode[];
    advance(): FragmentCursor | null;
    /**
     * Creates an unparsed TabFragment object that can be incrementally parsed
     * by repeatedly calling the TabFragment.advance() method.
     * @param node source node from which parsing begins
     * @param editorState the EditorState from which the sourceNode was obtained
     * @returns an unparsed TabFragment object
     */
    static startParse(node: SyntaxNode, editorState: EditorState): TabFragment | null;
    /**
     * Applies a set of edits to an array of fragments, reusing unaffected fragments,
     * removing fragments overlapping with edits, or creating new fragments with
     * adjusted positions to replace fragments which have moved as a result of edits.
     * @param fragments a set of TabFragment objects
     * @param changes a set of ChangedRanges representing edits
     * @returns a new set of fragments
     */
    static applyChanges(fragments: readonly TabFragment[], changes: readonly ChangedRange[]): readonly TabFragment[];
    private createOffsetCopy;
    /**
     * Create a set of fragments from a freshly parsed tree, or update
     * an existing set of fragments by replacing the ones that overlap
     * with a tree with content from the new tree.
     * @param tree a freshly parsed tree
     * @param fragments a set of fragments
     * @returns fragment set produced by merging the tree's fragment set with the provided fragment set
     */
    static addTree(tree: TabTree, fragments?: readonly TabFragment[]): TabFragment[];
    static createBlankFragment(from: number, to: number): TabFragment;
    get cursor(): FragmentCursor;
    toString(): string;
    get isParsed(): boolean;
}

declare abstract class TabParser {
    abstract createParse(editorState: EditorState, fragments: readonly TabFragment[], ranges: readonly {
        from: number;
        to: number;
    }[]): PartialTabParse;
    startParse(editorState: EditorState, fragments?: readonly TabFragment[], ranges?: readonly {
        from: number;
        to: number;
    }[]): PartialTabParse;
    parse(editorState: EditorState, fragments?: readonly TabFragment[], ranges?: readonly {
        from: number;
        to: number;
    }[]): TabTree;
}
declare class TabParserImplement extends TabParser {
    createParse(editorState: EditorState, fragments: readonly TabFragment[], ranges: readonly {
        from: number;
        to: number;
    }[]): PartialTabParse;
}
interface PartialTabParse {
    advance(catchupTimeout?: number): {
        blocked: boolean;
        tree: TabTree | null;
    };
    readonly parsedPos: number;
    stopAt(pos: number): void;
    readonly stoppedAt: number | null;
    getFragments(): TabFragment[];
}

declare type GroupedNodeList = {
    [nodeType: string]: SourceNode[];
};
declare class ASTNode {
    readonly name: string;
    readonly classList: string[];
    private sourceNodes;
    constructor(name: string, classList: string[], sourceNodes: GroupedNodeList);
}
declare class NodeGenerator {
    private node_blueprint;
    readonly source_text: Text;
    constructor(node_blueprint: NodeBlueprint, source_text: Text);
    /**
     * Constructs an ASTNode from a SourceNode object using the blueprint
     * @param sourceNode source
     * @returns an ASTNode object, or null if the sourceNode type does not have an entry in the blueprint.
     */
    generateNode(sourceNode: SourceNode): ASTNode | null;
    /**
     * Creates an ASTNode with the properties specified.
     * @param name the name of the node to be built
     * @param sourceNodes the sourceNodes from which this node is to be derived.
     * @returns an ASTNode object, or null if the blueprint does not have an entry for this node name.
     */
    buildNode(name: string, sourceNodes: GroupedNodeList): ASTNode | null;
}

declare type NodeBlueprint = {
    anchors: Set<string>;
    blueprint: {
        [nodeName: string]: {
            sourceNodeTypes: SourceNodeTypes[];
            classList?: string[];
            group?(sourceNodes: GroupedNodeList, generator: NodeGenerator): ASTNode[];
        };
    };
};
declare const blueprint: NodeBlueprint;

declare function defineTabLanguageFacet(baseData?: {
    [name: string]: any;
}): Facet<{
    [name: string]: any;
}, readonly {
    [name: string]: any;
}[]>;
declare class TabLanguage {
    readonly data: Facet<{
        [name: string]: any;
    }>;
    readonly extension: Extension;
    parser: TabParser;
    constructor(data: Facet<{
        [name: string]: any;
    }>, parser: TabParser, extraExtensions?: Extension[]);
    isActiveAt(state: EditorState, pos: number, side?: -1 | 0 | 1): boolean;
    get allowsNesting(): boolean;
    static define(spec: {
        parser: TabParser;
        languageData?: {
            [name: string]: any;
        };
    }): TabLanguage;
    static state: StateField<TabLanguageState>;
    static setState: _codemirror_state.StateEffectType<TabLanguageState>;
}
declare function tabLanguageDataFacetAt(state: EditorState, pos: number, side: -1 | 0 | 1): Facet<{
    [name: string]: any;
}, readonly {
    [name: string]: any;
}[]>;
declare function tabSyntaxTree(state: EditorState): TabTree;
declare function ensureTabSyntaxTree(state: EditorState, upto: number, timeout?: number): TabTree | null;
declare function tabSyntaxTreeAvailable(state: EditorState, upto?: number): boolean;
declare function tabSyntaxParserRunning(view: EditorView): boolean | (() => void);
declare class ParseContext {
    private parser;
    readonly state: EditorState;
    fragments: readonly TabFragment[];
    tree: TabTree;
    treeLen: number;
    viewport: {
        from: number;
        to: number;
    };
    skipped: {
        from: number;
        to: number;
    }[];
    scheduleOn: Promise<unknown> | null;
    private parse;
    tempSkipped: {
        from: number;
        to: number;
    }[];
    constructor(parser: TabParser, state: EditorState, fragments: readonly TabFragment[], tree: TabTree, treeLen: number, viewport: {
        from: number;
        to: number;
    }, skipped: {
        from: number;
        to: number;
    }[], scheduleOn: Promise<unknown> | null);
    private startParse;
    work(time: number, upto?: number): boolean;
    takeTree(): void;
    private withContext;
    private withoutTempSkipped;
    changes(changes: ChangeDesc, newState: EditorState): ParseContext;
    updateViewport(viewport: {
        from: number;
        to: number;
    }): boolean;
    reset(): void;
    skipUntilInView(from: number, to: number): void;
    static getSkippingParser(until?: Promise<unknown>): {
        createParse(editorState: EditorState, fragments: readonly TabFragment[], ranges: readonly {
            from: number;
            to: number;
        }[]): PartialTabParse;
        startParse(editorState: EditorState, fragments?: readonly TabFragment[], ranges?: readonly {
            from: number;
            to: number;
        }[]): PartialTabParse;
        parse(editorState: EditorState, fragments?: readonly TabFragment[], ranges?: readonly {
            from: number;
            to: number;
        }[]): TabTree;
    };
    isDone(upto: number): boolean;
    static get(): ParseContext;
}
declare class TabLanguageState {
    readonly context: ParseContext;
    readonly tree: TabTree;
    constructor(context: ParseContext);
    apply(tr: Transaction): TabLanguageState;
    static init(state: EditorState): TabLanguageState;
}
declare const tabLanguage: Facet<TabLanguage, TabLanguage>;
declare class TabLanguageSupport {
    readonly tabLanguage: TabLanguage;
    readonly support: Extension;
    extension: Extension;
    constructor(tabLanguage: TabLanguage, support?: Extension);
}

export { ASTNodeTypes, ParseContext, ResolvedASTNode, SourceNodeTypes, TabLanguage, TabLanguageSupport, TabParserImplement, TabTree, TabTreeCursor, blueprint, defineTabLanguageFacet, ensureTabSyntaxTree, tabLanguage, tabLanguageDataFacetAt, tabSyntaxParserRunning, tabSyntaxTree, tabSyntaxTreeAvailable };
