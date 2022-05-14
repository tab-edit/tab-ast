import * as _codemirror_state from '@codemirror/state';
import { Text, EditorState, Facet, Extension, StateField, ChangeDesc, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import * as _lezer_common from '@lezer/common';
import { SyntaxNode, ChangedRange } from '@lezer/common';

/**
 * enum values for syntax nodes from the tab-edit/parser-tablature package. (should probably be defined in that package instead.)
 */
declare enum SourceSyntaxNodeTypes {
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
    InvalidToken = "\u26A0"
}
/**
* a wrapper class around the SyntaxNode object, but
* whose ranges/positions are all relative to a given
* anchor position.
*/
declare class AnchoredSyntaxNode {
    private node;
    private anchorPos;
    constructor(node: SyntaxNode, anchorPos: number);
    get type(): _lezer_common.NodeType;
    get name(): string;
    get from(): number;
    get to(): number;
    getChild(type: string | number): AnchoredSyntaxNode;
    getChildren(type: string | number): AnchoredSyntaxNode[];
    createOffsetCopy(offset: number): AnchoredSyntaxNode;
}
/**
 * Terrible name. Make sure to change
 */
declare class ResolvedASTNode {
    private anchoredNode;
    private anchorFragment;
    constructor(anchoredNode: AnchoredASTNode, anchorFragment: TabFragment);
    get name(): string;
    get ranges(): number[];
    private _sourceSyntaxNodes;
    /**
     * returns the source syntax nodes that make up the ASTNode at the current cursor position.
     * Unlike in AnchoredASTNode.sourceSyntaxNodes or FragmentCursor.sourceSyntaxNodes(), the
     * returned nodes are anchored to the start of the document, so their ranges will directly
     * correspond to the position in the source text which they cover
     * @returns
     */
    sourceSyntaxNodes(): {
        [type: string]: AnchoredSyntaxNode[];
    };
    /**
     * Generates a hash for this node. This hash is unique for every node
     * in the abstract syntax tree of the source text.
     * @returns a string hash for the node
     */
    hash(): string;
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
        [type: string]: AnchoredSyntaxNode[];
    };
    private _hash;
    /**
     * generates a hash for the AnchoredASTNode from its name and ranges
     * @returns a string hash for the node
     */
    hash(): string;
}

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
    getAncestors(): ResolvedASTNode[];
    firstChild(): boolean;
    lastChild(): boolean;
    parent(): boolean;
    prevSibling(): boolean;
    nextSibling(): boolean;
    fork(): TabTreeCursor;
}
declare class FragmentCursor implements Cursor<AnchoredASTNode> {
    private nodeSet;
    private pointer;
    private ancestryTrace;
    private constructor();
    static from(nodeSet: AnchoredASTNode[]): FragmentCursor;
    get name(): string;
    get node(): AnchoredASTNode;
    getAncestors(): AnchoredASTNode[];
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
    enter: (name: string, cursor: TabTreeCursor) => false | void;
    leave?: (name: string, cursor: TabTreeCursor) => void;
    from?: number;
    to?: number;
};

declare class TabFragment {
    readonly from: number;
    readonly to: number;
    static get AnchorNodeType(): SourceSyntaxNodeTypes;
    readonly isBlankFragment: boolean;
    private linearParser?;
    private constructor();
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

export { ParseContext, ResolvedASTNode, SourceSyntaxNodeTypes, TabLanguage, TabLanguageSupport, TabParserImplement, TabTree, TabTreeCursor, defineTabLanguageFacet, ensureTabSyntaxTree, tabLanguage, tabLanguageDataFacetAt, tabSyntaxParserRunning, tabSyntaxTree, tabSyntaxTreeAvailable };
