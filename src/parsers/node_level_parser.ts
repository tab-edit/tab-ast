import { EditorState } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import { ASTNode, Measure, TabSegment } from "../tree/nodes";
import { TabFragment } from "../tree/tab_fragment";

/// LinearParser enables gradual parsing of a raw syntax node into an array-based tree data structure efficiently using a singly-linked list structure
// the demo below shows how the LinearParser works (the underscores (_xyz_) show what nodes are added in a given step)
// init:      [_rootNode_]
// advance(): [rootNode, _rootNodeChild1, rootNodeChild2, rootNodeChild3..._]
// advance(): [rootNode, rootNodeChild1, _rootNodeChild1Child1, rootNodeChild1Child2, ..._, rootNodeChild2, rootNodeChild3...]
// ...
// This is done using a singly-linked list to make it more efficient than performing array insert operations.
export class LinearParser {
    // TODO: you might want to change this later to a Uint16array with the following format:
    // [node1typeID, length, rangeLen, ranges..., node2typeID, ...]
    // To do this, you will have to modify the ASTNode.increaseLength() function to account 
    // for the fact that different nodes can have different ranges
    private nodeSet: ASTNode[] = [];
    private head: LPNode | null = null;
    constructor(
        initialNode: SyntaxNode,
        /// The index of all the parsed content will be relative to this offset
        /// This is usually the index of the source TabFragment, to make 
        /// for efficient relocation of TabFragments
        readonly offset: number,
        private editorState: EditorState
    ) {
        if (initialNode.name!==TabFragment.AnchorNode) throw new Error("Parsing starting from a node other than the TabFragment's anchor node is not supported at this time.");
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
        let children = content.parse(this.editorState);
        for (let ancestor of this.ancestryStack) {
            this.nodeSet[ancestor].increaseLength(children);
        }
        this.head = new LPNode(children, this.head);
        return null;
    }
    get isDone() { return this.head==null }
    private cachedIsValid: boolean | null = null;
    get isValid() {
        if (this.cachedIsValid!==null) return this.cachedIsValid;
        if (!this.isDone) return false;
        let nodeSet = this.advance();
        if (!nodeSet) return true; //this should never be the case cuz we've finished parsing, but just to be sure...

        let hasMeasureline = false;
        outer: for (let node of nodeSet) {
            if (node.name!==Measure.name) continue;
            for (let i=1; i<node.ranges.length; i+=2) {
                hasMeasureline = hasMeasureline || this.editorState.doc.slice(node.offset+node.ranges[i-1], node.offset+node.ranges[i]).toString().replace(/\s/g, '').length !== 0
                if (hasMeasureline) break outer;
            }
        }
        this.cachedIsValid = hasMeasureline;
        return this.cachedIsValid;
    }
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