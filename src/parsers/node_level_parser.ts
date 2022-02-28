import { SyntaxNode } from "@lezer/common";
import { ASTNode, TabSegment } from "../tree/nodes";
import { TabFragment } from "../tree/tab_fragment";

/// LinearParser enables gradual parsing of a raw syntax node into an array-based tree data structure efficiently using a singly-linked list structure
export class LinearParser {
    private nodeSet: ASTNode[] = [];
    private head: LPNode | null = null;
    constructor(
        initialNode: SyntaxNode,
        /// The index of all the parsed content will be relative to this offset
        /// This is usually the index of the source TabFragment, to make 
        /// for efficient relocation of TabFragments
        readonly offset: number
    ) {
        if (initialNode.name!=TabFragment.AnchorNode) throw new Error("Parsing starting from a node other than the TabFragment's anchor node is not supported at this time.");
        let initialContent = [new TabSegment({[TabFragment.AnchorNode]: [initialNode]}, offset)]
        this.head = new LPNode(initialContent, null);
    }

    private ancestryStack: number[] = [];
    advance(): ASTNode[] | null {
        if (!this.head) return this.nodeSet;
        let content = this.head.getNextContent();
        if (!content) {
            this.head = this.head.next;
            this.ancestryStack.pop();
            return null;
        }

        this.nodeSet.push(content);
        this.ancestryStack.push(this.nodeSet.length-1);
        let children = content.parse();
        for (let ancestor of this.ancestryStack) {
            this.nodeSet[ancestor].increaseLength(children);
        }
        this.head = new LPNode(children, this.head);
        return null;
    }
    get isDone() { return this.head==null }
}

class LPNode {
    private contentPointer: number = 0;
    constructor(
        private content: ASTNode[], 
        public next: LPNode | null
    ) {}

    getNextContent(): ASTNode | null {
        if (this.contentPointer >= this.content.length) return null;
        return this.content[this.contentPointer++];
    }
}