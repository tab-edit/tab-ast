import { Text } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import { ASTNode } from "../tree/nodes";
export declare class LinearParser {
    readonly offset: number;
    private sourceText;
    private nodeSet;
    private head;
    constructor(initialNode: SyntaxNode, offset: number, sourceText: Text);
    private ancestryStack;
    advance(): ASTNode[] | null;
    get isDone(): boolean;
    private cachedIsValid;
    get isValid(): boolean;
}
