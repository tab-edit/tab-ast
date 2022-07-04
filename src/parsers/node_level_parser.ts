import { ASTNode, NodeGenerator } from "../structure/node-generator";
import { SourceNode } from "../structure/nodes";

/**
 * The LinearParser class enables gradual parsing of a raw syntax node into an array-based tree data structure.
 * The demo below shows how the LinearParser works (the underscores (_xyz_) show what nodes are added in a given step):
 * 
 * init:      [_rootNode_]
 * advance(): [rootNode, _rootNodeChild1, rootNodeChild2, rootNodeChild3..._]
 * advance(): [rootNode, rootNodeChild1, _rootNodeChild1Child1, rootNodeChild1Child2, ..._, rootNodeChild2, rootNodeChild3...]
 * ...
 * 
 * This is done using a singly-linked list for O(n) performance.
 */
export class LinearParser {
    private nodeSet: ASTNode[] = [];
    private head: LPNode | null = null;
    constructor(
        initialNode: SourceNode,
        private generator: NodeGenerator
    ) {
        this.head = new LPNode([generator.generateNode(initialNode)], null);
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
        let children = this.generator.group(content);
        for (let ancestor of this.ancestryStack) {
            this.nodeSet[ancestor].increaseDecendantCount(children);
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