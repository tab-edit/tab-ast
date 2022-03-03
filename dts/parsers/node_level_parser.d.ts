import { EditorState } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import { ASTNode } from "../tree/nodes";
export declare class LinearParser {
    readonly offset: number;
    private editorState;
    private nodeSet;
    private head;
    constructor(initialNode: SyntaxNode, offset: number, editorState: EditorState);
    private ancestryStack;
    advance(): ASTNode[] | null;
    get isDone(): boolean;
    private isInvalidCache;
    get isInvalid(): boolean;
}
