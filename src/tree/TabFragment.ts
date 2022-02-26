import { EditorState } from "@codemirror/state";
import { ChangedRange, SyntaxNode } from "@lezer/common";
import { ASTNode, SyntaxNodeTypes, TabSegment } from "./nodes";

export class TabFragment {
    get name() { return SyntaxNodeTypes.TabSegment }

    constructor(
        readonly from: number,
        readonly to: number,
        rootNode: SyntaxNode | null,
        private linearParser?: LinearParser
    ) {
        if (linearParser) return;
        if (!rootNode) throw new Error("rootNode must be present if no linearParser is provided");
        if (rootNode.name!=SyntaxNodeTypes.TabSegment) throw new Error("Incorrect node type used.");
        this.linearParser = new LinearParser(rootNode, this.from);
    }

    advance():FragmentNodeCursor | null {
        let nodeSet = this.linearParser.advance();
        return nodeSet ? new FragmentNodeCursor(nodeSet) : null;
    }

    
    /// starts parsing this TabFragment from the raw SyntaxNode. this is made to be 
    /// incremental to prevent blocking when there are a lot of Tab Blocks on the same line
    static startParse(node: SyntaxNode, editorState: EditorState): TabFragment | null {
        let source = editorState.doc.toString();
        if (node.from >= source.length || node.to > source.length) return null;
        if (node.name != SyntaxNodeTypes.TabSegment) return null;
        return new TabFragment(node.from, node.to, node);
    }

    /// Apply a set of edits to an array of fragments, removing
    /// fragments as necessary to remove edited ranges, and
    /// adjusting offsets for fragments that moved.
    static applyChanges(fragments: readonly TabFragment[], changes: readonly ChangedRange[]) {
        if (!changes.length) return fragments;
        let result: TabFragment[] = [];
        let fI = 1, nextF = fragments.length ? fragments[0] : null;
        for (let cI = 0, off=0;; cI++) {
            let nextC = cI < changes.length ? changes[cI] : null;
            // TODO: be careful here with the <=. test to make sure that it should be <= and not just <.
            while (nextF && nextF.from <= nextC.toA) {
                if (!nextC || nextF.to<=nextC.fromA) result.push(nextF.offset(-off));
                nextF = fI < fragments.length ? fragments[fI++] : null;
            }
            off = nextC.toA - nextC.toB;
        }
    }

    offset(delta: number):TabFragment|null {
        if (this.from+delta < 0) return null;
        return new TabFragment(this.from+delta, this.to+delta, null, this.linearParser);
    }
    
    get isParsed() { return !this.linearParser.isDone }
    get isInvalid() { 
        // TODO: implement ways of checking if the TabFragment is valid: e.g. if there are only zero-width measure lines, and no measure lines with duration or notes
        return false;
    }
}



/// insertAt() operations are expensive, so this LinearParser data structure does a pre-order parsing more efficiently using singly-linked lists
class LinearParser {
    // TODO: we can potentially make this result to be a 2-d array of numbers where 
    // each array starts with a number representing the node type and a number representing the length
    // of the array it and its children occupy, and the rest of the 
    // numbers are the node's ranges. this requires very minimal changes to implement
    // **compare efficiency of having a number telling how many indices the ranges occupy, vs having 2d array with one node being an array
    // ** so potentially: [node1type, node1length, node1rangelength, node1ranges..., node2type, ...] (i think this will be better but might not work cuz node1length now has to take into account the range length of all its nested childeren)
    // ** or potentially: [[node1type, node1length, node1ranges...], [node2type...], ...]
    // and make sure to make it a Uint16array
    // important consideration - it might be better to go with what i already had, array of class objects: https://stackoverflow.com/questions/33004572/java-performance-memory-consumption-class-vs-array
    private nodeSet: ASTNode[] = [];
    private head: LPNode | null = null;
    constructor(
        initialNode: SyntaxNode,
        /// The index of all the parsed content will be relative to this offset
        /// This is usually the index of the source TabFragment, to make 
        /// for efficient relocation of TabFragments
        readonly offset: number
    ) {
        if (initialNode.name!=SyntaxNodeTypes.TabSegment) throw new Error("Parsing starting from a node other than the TabSegment node is not supported at this time.");
        let initialContent = [new TabSegment({[SyntaxNodeTypes.TabSegment]: [initialNode]}, offset)]
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




export class TabTree {
    static ParseAnchor = TabFragment.name;

    constructor(readonly fragments: TabFragment[] = []) {}
    getFragments() { return this.fragments }
    static readonly empty = new TabTree();
}

// TODO: implement TabFragmentCursor that traverses TabFragments
class FragmentNodeCursor {
    constructor(readonly nodeSet:ASTNode[]) {}
    // TODO: implement class (nextSibling, prevSibling, parent, firstChild...)
}