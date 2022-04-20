import { SyntaxNode } from "@lezer/common";
import { ASTNode } from "./nodes";
import { TabFragment } from "./tab_fragment";
export interface Cursor<T> {
    name: string;
    node: Readonly<T>;
    firstChild(): boolean;
    lastChild(): boolean;
    parent(): boolean;
    prevSibling(): boolean;
    nextSibling(): boolean;
    fork(): Cursor<T>;
}
export declare class FragmentCursor implements Cursor<ASTNode> {
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
export declare class ASTCursor implements Cursor<ASTNode> {
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
export declare class AnchoredSyntaxCursor implements Cursor<OffsetSyntaxNode> {
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
    fork(): AnchoredSyntaxCursor;
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
