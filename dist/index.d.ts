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
declare class FragmentCursor implements Cursor<ASTNode> {
    private fragSet;
    private pointer;
    private currentCursor?;
    private constructor();
    static from(fragSet: TabFragment[], startingPos?: number): FragmentCursor;
    get name(): string;
    get ranges(): number[];
    get node(): Readonly<ASTNode>;
    sourceSyntaxNode(): AnchoredSyntaxCursor;
    getAncestors(): Readonly<ASTNode>[];
    firstChild(): boolean;
    lastChild(): boolean;
    parent(): boolean;
    prevSibling(): boolean;
    nextSibling(): boolean;
    fork(): FragmentCursor;
}
declare class ASTCursor implements Cursor<ASTNode> {
    private nodeSet;
    private pointer;
    private ancestryTrace;
    private constructor();
    static from(nodeSet: ASTNode[]): ASTCursor;
    get name(): string;
    get ranges(): number[];
    get node(): Readonly<ASTNode>;
    sourceSyntaxNode(): AnchoredSyntaxCursor;
    getAncestors(): Readonly<ASTNode>[];
    firstChild(): boolean;
    lastChild(): boolean;
    parent(): boolean;
    prevSibling(): boolean;
    nextSibling(): boolean;
    fork(): ASTCursor;
    static readonly dud: ASTCursor;
    printTree(): string;
    private printTreeRecursiveHelper;
}
declare class AnchoredSyntaxCursor implements Cursor<OffsetSyntaxNode> {
    private anchorOffset;
    private cursor;
    constructor(startingNode: SyntaxNode, anchorOffset: number);
    get type(): _lezer_common.NodeType;
    get name(): string;
    get from(): number;
    get to(): number;
    get node(): Readonly<OffsetSyntaxNode>;
    firstChild(): boolean;
    lastChild(): boolean;
    enter(pos: number, side: -1 | 0 | 1): boolean;
    parent(): boolean;
    nextSibling(): boolean;
    prevSibling(): boolean;
    fork(): AnchoredSyntaxCursor;
}
declare class OffsetSyntaxNode {
    private node;
    private offset;
    constructor(node: SyntaxNode, offset: number);
    get type(): _lezer_common.NodeType;
    get name(): string;
    get from(): number;
    get to(): number;
}

declare enum SyntaxNodeTypes {
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
declare abstract class ASTNode {
    protected sourceNodes: {
        [type: string]: SyntaxNode[];
    };
    readonly offset: number;
    get isSingleSpanNode(): boolean;
    readonly ranges: Uint16Array;
    constructor(sourceNodes: {
        [type: string]: SyntaxNode[];
    }, offset: number);
    get name(): string;
    private parsed;
    get isParsed(): boolean;
    parse(sourceText: Text): ASTNode[];
    protected abstract createChildren(sourceText: Text): ASTNode[];
    protected disposeSourceNodes(): void;
    private _length;
    increaseLength(children: ASTNode[]): void;
    get length(): number;
    protected computeRanges(sourceNodes: {
        [type: string]: SyntaxNode[];
    }, offset: number): number[];
}

declare class LinearParser {
    private sourceText;
    private nodeSet;
    private head;
    constructor(initialNode: ASTNode, sourceText: Text);
    private ancestryStack;
    advance(): ASTNode[] | null;
    get isDone(): boolean;
    private cachedIsValid;
    get isValid(): boolean;
}

declare class TabFragment {
    readonly from: number;
    readonly to: number;
    private linearParser?;
    static get AnchorNode(): SyntaxNodeTypes;
    readonly isBlankFragment: boolean;
    constructor(from: number, to: number, rootNode: SyntaxNode, editorState: EditorState, linearParser?: LinearParser);
    advance(): ASTCursor | null;
    static startParse(node: SyntaxNode, editorState: EditorState): TabFragment | null;
    static applyChanges(fragments: readonly TabFragment[], changes: readonly ChangedRange[]): readonly TabFragment[];
    private offset;
    static addTree(tree: TabTree, fragments?: readonly TabFragment[]): TabFragment[];
    static createBlankFragment(from: number, to: number): TabFragment;
    get cursor(): ASTCursor;
    toString(): string;
    get isParsed(): boolean;
}
declare type IteratorSpec = {
    enter: (node: Readonly<ASTNode>, getCursor: () => FragmentCursor) => false | void;
    leave?: (node: Readonly<ASTNode>, getCursor: () => FragmentCursor) => void;
    from?: number;
    to?: number;
};
declare class TabTree {
    readonly fragments: TabFragment[];
    readonly from: number;
    readonly to: number;
    constructor(fragments: TabFragment[]);
    get cursor(): FragmentCursor;
    static createBlankTree(from: number, to: number): TabTree;
    getFragments(): TabFragment[];
    toString(): string;
    iterate(spec: IteratorSpec): void;
    private iterateHelper;
    static readonly empty: TabTree;
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

export { ASTCursor, ASTNode, Cursor, FragmentCursor, ParseContext, TabLanguage, TabLanguageSupport, TabParserImplement, TabTree, defineTabLanguageFacet, ensureTabSyntaxTree, tabLanguage, tabLanguageDataFacetAt, tabSyntaxParserRunning, tabSyntaxTree, tabSyntaxTreeAvailable };
