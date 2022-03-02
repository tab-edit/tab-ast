import { EditorState } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import { ASTNode, Measure, TabSegment } from "../tree/nodes";
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
        readonly offset: number,
        private editorState: EditorState
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
        let children = content.parse(this.editorState);
        for (let ancestor of this.ancestryStack) {
            this.nodeSet[ancestor].increaseLength(children);
        }
        this.head = new LPNode(children, this.head);
        return null;
    }
    get isDone() { return this.head==null }
    private isInvalidCache: boolean | null = null;
    get isInvalid() {
        if (this.isInvalidCache!=null) return this.isInvalidCache;
        if (!this.isDone) return false;
        let nodeSet = this.advance();
        if (!nodeSet) return true; //this should never be the case cuz we've finished parsing, but just to be sure...

        let hasMeasureline = false;
        outer: for (let node of nodeSet) {
            if (node.name!=Measure.name) continue;
            for (let i=1; i<node.ranges.length; i+=2) {
                hasMeasureline = hasMeasureline || this.editorState.doc.slice(node.ranges[i-1], node.ranges[i]).toString().replace(/\s/g, '').length == 0
                if (hasMeasureline) break outer;
            }
        }
        this.isInvalidCache = hasMeasureline;
        return this.isInvalidCache;
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