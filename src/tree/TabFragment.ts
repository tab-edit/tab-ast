import { EditorState } from "@codemirror/state";
import { ChangedRange, SyntaxNode } from "@lezer/common";
import { SyntaxNodeTypes } from "./ast";
import { ASTNode, TabSegment } from "./nodes";

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
        this.linearParser = new LinearParser(
            [new TabSegment(Uint16Array.from([rootNode.from,rootNode.to]), {[SyntaxNodeTypes.TabSegment]: [rootNode]})],
            from
        );
    }

    advance():boolean {
        return this.linearParser.advance() == null;
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
    private result: ASTNode[] = [];
    private head: LPNode | null = null;
    constructor(
        initialContent: ASTNode[],
        /// All parsed content's indices will be relative to this offset (makes for more efficient reusing of TabFragments when parsing incrementally)
        private offset: number
    ) {
        this.head = new LPNode(initialContent, null);
    }

    advance(): ASTNode[] | null {
        // TODO: we still need to keep track of the ancestry stack of a given node to be able to tell the length that each node and its children take up in the result array
        if (!this.head) return this.result;
        let content = this.head.getNextContent();
        if (!content) this.head = this.head.next;
        this.result.push(content);
        this.head = new LPNode(content.parse(this.offset), this.head);
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