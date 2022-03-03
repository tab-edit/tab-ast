import { EditorState } from "@codemirror/state";
import { TabFragment, TabTree } from "../tree/tab_fragment";
export declare abstract class TabParser {
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
export declare class TabParserImplement extends TabParser {
    createParse(editorState: EditorState, fragments: readonly TabFragment[], ranges: readonly {
        from: number;
        to: number;
    }[]): PartialTabParse;
}
export interface PartialTabParse {
    advance(catchupTimeout?: number): {
        blocked: boolean;
        tree: TabTree | null;
    };
    readonly parsedPos: number;
    stopAt(pos: number): void;
    readonly stoppedAt: number | null;
    getFragments(): TabFragment[];
}
export declare class PartialTabParseImplement implements PartialTabParse {
    private editorState;
    private cachedFragments;
    readonly ranges: readonly {
        from: number;
        to: number;
    }[];
    stoppedAt: number | null;
    private fragments;
    private to;
    private text;
    parsedPos: number;
    getFragments(): TabFragment[];
    constructor(editorState: EditorState, cachedFragments: readonly TabFragment[], ranges: readonly {
        from: number;
        to: number;
    }[]);
    advance(catchupTimeout?: number): {
        blocked: boolean;
        tree: TabTree | null;
    };
    stopAt(pos: number): void;
    private finish;
    private reuseFragment;
}
