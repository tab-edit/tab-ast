import { ChangeDesc, EditorState, Extension, Facet, StateField, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { TabParser, PartialTabParse } from "./parsers/fragment_level_parser";
import { TabFragment, TabTree } from "./tree/tab_fragment";
export { TabParserImplement } from "./parsers/fragment_level_parser";
export declare function defineTabLanguageFacet(baseData?: {
    [name: string]: any;
}): Facet<{
    [name: string]: any;
}, readonly {
    [name: string]: any;
}[]>;
export declare class TabLanguage {
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
    static setState: import("@codemirror/state").StateEffectType<TabLanguageState>;
}
export declare function tabLanguageDataFacetAt(state: EditorState, pos: number, side: -1 | 0 | 1): Facet<{
    [name: string]: any;
}, readonly {
    [name: string]: any;
}[]>;
export declare function tabSyntaxTree(state: EditorState): TabTree;
export declare function ensureTabSyntaxTree(state: EditorState, upto: number, timeout?: number): TabTree | null;
export declare function tabSyntaxTreeAvailable(state: EditorState, upto?: number): boolean;
export declare function tabSyntaxParserRunning(view: EditorView): boolean | (() => void);
export declare class ParseContext {
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
export declare const tabLanguage: Facet<TabLanguage, TabLanguage>;
export declare class TabLanguageSupport {
    readonly tabLanguage: TabLanguage;
    readonly support: Extension;
    extension: Extension;
    constructor(tabLanguage: TabLanguage, support?: Extension);
}
export { TabTree };
export { FragmentCursor } from './tree/cursors';
