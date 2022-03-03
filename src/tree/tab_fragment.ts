// TODO: credit https://github.com/lezer-parser/common/blob/main/src/parse.ts
import { EditorState } from "@codemirror/state";
import { SyntaxNodeTypes } from "./nodes";
import { LinearParser } from "../parsers/node_level_parser";
import { FragmentCursor } from "./cursors";
import { ChangedRange, SyntaxNode } from "@lezer/common";

export class TabFragment {
    // the position of all nodes within a tab fragment is relative to (anchored by) the position of the tab fragment
    static AnchorNode: string = SyntaxNodeTypes.TabSegment;

    constructor(
        readonly from: number,
        readonly to: number,
        rootNode: SyntaxNode,
        editorState: EditorState,
        private linearParser?: LinearParser
    ) {
        if (linearParser) return;
        if (!rootNode) {
            this._isBlankFragment = true;
            return;
        }
        if (rootNode.name!=TabFragment.AnchorNode) throw new Error("Incorrect node type used.");
        this.linearParser = new LinearParser(rootNode, this.from, editorState);
    }

    advance(): FragmentCursor | null {
        if (this.isBlankFragment) return FragmentCursor.dud;
        let nodeSet = this.linearParser.advance();
        return nodeSet ? this.linearParser.isInvalid ? FragmentCursor.dud : FragmentCursor.from(nodeSet) : null;
    }

    
    /// starts parsing this TabFragment from the raw SyntaxNode. this is made to be 
    /// incremental to prevent blocking when there are a lot of Tab Blocks on the same line
    static startParse(node: SyntaxNode, editorState: EditorState): TabFragment | null {
        if (node.name != TabFragment.AnchorNode) return null;
        return new TabFragment(node.from, node.to, node, editorState);
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

    private offset(delta: number):TabFragment|null {
        if (this.from+delta < 0) return null;
        return new TabFragment(this.from+delta, this.to+delta, null, null, this.linearParser);
    }
    /// Create a set of fragments from a freshly parsed tree, or update
    /// an existing set of fragments by replacing the ones that overlap
    /// with a tree with content from the new tree.
    static addTree(tree: TabTree, fragments: readonly TabFragment[] = []) {
        let result = [...tree.getFragments()];
        for (let f of fragments) if (f.to > tree.to) result.push(f);
        return result
    }

    _isBlankFragment = false;
    get isBlankFragment() {
        return this._isBlankFragment;
    }
    static createBlankFragment(from: number, to: number) {
        return new TabFragment(from, to, null, null);
    }

    get cursor() {
        return this.isParsed ? this.advance() : null;
    }

    toString() {
        return this.cursor?.printTree() || "";
    }

    
    get isParsed() { return this.isBlankFragment || !this.linearParser.isDone }
}


export class TabTree {
    static ParseAnchor = TabFragment.name;
    private _from: number;
    private _to: number;
    get from() { return this._from }
    get to() { return this._to }
    constructor(readonly fragments: TabFragment[]) {
        this._from = fragments[0] ? fragments[0].from : 0;
        this._to = fragments[fragments.length-1] ? fragments[fragments.length-1].to : 0;
    }

    static createBlankTree(from: number, to:  number) {
        return new TabTree([TabFragment.createBlankFragment(from, to)]);
    }

    getFragments() { return this.fragments }
    toString() {
        let str = "Tree("
        for (let fragment of this.fragments) {
            str += fragment.toString();
        }
        str += ")"
    }
    static readonly empty = new TabTree([]);
}

