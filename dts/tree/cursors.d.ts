import { SyntaxNode } from "@lezer/common";
import { ASTNode } from "./nodes";
interface Cursor {
    name: string;
    node: Readonly<ASTNode> | Readonly<OffsetSyntaxNode>;
    firstChild(): boolean;
    lastChild(): boolean;
    parent(): boolean;
    prevSibling(): boolean;
    nextSibling(): boolean;
}
export declare class FragmentCursor implements Cursor {
    private nodeSet;
    private pointer;
    private ancestryTrace;
    private constructor();
    static from(nodeSet: ASTNode[]): FragmentCursor;
    get name(): string;
    get node(): Readonly<ASTNode>;
    sourceSyntaxNode(): AnchoredSyntaxCursor;
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
export declare class AnchoredSyntaxCursor implements Cursor {
    private anchorOffset;
    private cursor;
    constructor(startingNode: SyntaxNode, anchorOffset: number);
    get type(): import("@lezer/common").NodeType;
    get name(): string;
    get from(): number;
    get to(): number;
    get node(): Readonly<OffsetSyntaxNode>;
    firstChild(): boolean;
    lastChild(): boolean;
    enter(pos: number, side: -1 | 0 | 1, overlays?: boolean, buffers?: boolean): boolean;
    parent(): boolean;
    nextSibling(): boolean;
    prevSibling(): boolean;
}
declare class OffsetSyntaxNode {
    private node;
    private offset;
    constructor(node: SyntaxNode, offset: number);
    get type(): import("@lezer/common").NodeType;
    get name(): string;
    get from(): number;
    get to(): number;
}
export {};
