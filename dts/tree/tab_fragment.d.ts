import { EditorState } from "@codemirror/state";
import { LinearParser } from "../parsers/node_level_parser";
import { FragmentCursor } from "./cursors";
import { ChangedRange, SyntaxNode } from "@lezer/common";
export declare class TabFragment {
    readonly from: number;
    readonly to: number;
    private linearParser?;
    static AnchorNode: string;
    constructor(from: number, to: number, rootNode: SyntaxNode, editorState: EditorState, linearParser?: LinearParser);
    advance(): FragmentCursor | null;
    static startParse(node: SyntaxNode, editorState: EditorState): TabFragment | null;
    static applyChanges(fragments: readonly TabFragment[], changes: readonly ChangedRange[]): readonly TabFragment[];
    private offset;
    static addTree(tree: TabTree, fragments?: readonly TabFragment[]): TabFragment[];
    _isBlankFragment: boolean;
    get isBlankFragment(): boolean;
    static createBlankFragment(from: number, to: number): TabFragment;
    get cursor(): FragmentCursor;
    toString(): string;
    get isParsed(): boolean;
}
export declare class TabTree {
    readonly fragments: TabFragment[];
    static ParseAnchor: string;
    private _from;
    private _to;
    get from(): number;
    get to(): number;
    constructor(fragments: TabFragment[]);
    static createBlankTree(from: number, to: number): TabTree;
    getFragments(): TabFragment[];
    toString(): void;
    static readonly empty: TabTree;
}
