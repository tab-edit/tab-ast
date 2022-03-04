import { EditorState } from "@codemirror/state";
import { ASTNode } from "./nodes";
import { LinearParser } from "../parsers/node_level_parser";
import { FragmentCursor } from "./cursors";
import { ChangedRange, SyntaxNode } from "@lezer/common";
export declare class TabFragment {
    readonly from: number;
    readonly to: number;
    private linearParser?;
    static AnchorNode: string;
    readonly isBlankFragment: boolean;
    constructor(from: number, to: number, rootNode: SyntaxNode, editorState: EditorState, linearParser?: LinearParser);
    advance(): FragmentCursor | null;
    static startParse(node: SyntaxNode, editorState: EditorState): TabFragment | null;
    static applyChanges(fragments: readonly TabFragment[], changes: readonly ChangedRange[]): readonly TabFragment[];
    private offset;
    static addTree(tree: TabTree, fragments?: readonly TabFragment[]): TabFragment[];
    static createBlankFragment(from: number, to: number): TabFragment;
    get cursor(): FragmentCursor;
    toString(): string;
    get isParsed(): boolean;
}
declare type IteratorSpec = {
    enter: (type: string, ranges: number[], get: () => Readonly<ASTNode>) => false | undefined;
    leave?: (type: string, ranges: number[], get: () => Readonly<ASTNode>) => void;
    from?: number;
    to?: number;
};
export declare class TabTree {
    readonly fragments: TabFragment[];
    static ParseAnchor: string;
    readonly from: number;
    readonly to: number;
    constructor(fragments: TabFragment[]);
    static createBlankTree(from: number, to: number): TabTree;
    getFragments(): TabFragment[];
    toString(): string;
    iterate(spec: IteratorSpec): void;
    private iterateHelper;
    static readonly empty: TabTree;
}
export {};
