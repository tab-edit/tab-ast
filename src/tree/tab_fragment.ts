import { EditorState } from "@codemirror/state";
import { ChangedRange, SyntaxNode } from "@lezer/common";
import { SyntaxNodeTypes } from "./nodes";
import { LinearParser } from "../parsers/node_level_parser";
import { FragmentCursor } from "./cursors";

export class TabFragment {
    // the position of all nodes within a tab fragment is relative to (anchored by) the position of the tab fragment
    static AnchorNode: string = SyntaxNodeTypes.TabSegment;

    constructor(
        readonly from: number,
        readonly to: number,
        rootNode: SyntaxNode | null,
        private linearParser?: LinearParser
    ) {
        if (linearParser) return;
        if (!rootNode) throw new Error("rootNode must be present if no linearParser is provided");
        if (rootNode.name!=TabFragment.AnchorNode) throw new Error("Incorrect node type used.");
        this.linearParser = new LinearParser(rootNode, this.from);
    }

    advance(): FragmentCursor | null {
        let nodeSet = this.linearParser.advance();
        return nodeSet ? new FragmentCursor(nodeSet) : null;
    }

    
    /// starts parsing this TabFragment from the raw SyntaxNode. this is made to be 
    /// incremental to prevent blocking when there are a lot of Tab Blocks on the same line
    static startParse(node: SyntaxNode, editorState: EditorState): TabFragment | null {
        let source = editorState.doc.toString();
        if (node.from >= source.length || node.to > source.length) return null;
        if (node.name != TabFragment.AnchorNode) return null;
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


export class TabTree {
    static ParseAnchor = TabFragment.name;

    constructor(readonly fragments: TabFragment[] = []) {}
    getFragments() { return this.fragments }
    static readonly empty = new TabTree();
}

