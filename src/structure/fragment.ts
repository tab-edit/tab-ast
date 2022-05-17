// TODO: credit https://github.com/lezer-parser/common/blob/main/src/parse.ts
import { EditorState, Text } from "@codemirror/state";
import { AnchoredASTNode, SourceSyntaxNodeTypes, TabSegment } from "./nodes";
import { LinearParser } from "../parsers/node_level_parser";
import { ChangedRange, SyntaxNode } from "@lezer/common";
import { TabTree } from "./tree";
import { FragmentCursor } from "./cursors";

// TODO: consider replacing all occurences of editorState with sourceText where sourceText is editorState.doc

export class TabFragment {
    // the position of all nodes within a tab fragment is relative to (anchored by) the position of the tab fragment
    static get AnchorNodeType() { return SourceSyntaxNodeTypes.TabSegment }
    readonly isBlankFragment: boolean;
    private linearParser?: LinearParser
    private constructor(
        readonly from: number,
        readonly to: number,
        rootNode: SyntaxNode,
        sourceText: Text,
    ) {
        this.isBlankFragment = !rootNode;
        if (this.isBlankFragment) return;
        if (rootNode.name!==TabFragment.AnchorNodeType) throw new Error(`Expected ${TabFragment.AnchorNodeType} node type for creating a TabFragment, but recieved a ${rootNode.name} node instead.`);
        let initialContent = new TabSegment({[TabFragment.AnchorNodeType]: [rootNode]}, this.from);
        this.linearParser = new LinearParser(initialContent, sourceText);
    }

    private _nodeSet:AnchoredASTNode[]; 
    get nodeSet() { return this._nodeSet }
    advance(): FragmentCursor | null {
        if (this.isBlankFragment) return FragmentCursor.dud;
        this._nodeSet = this.linearParser!.advance();

        return this.nodeSet ? (this.linearParser!.isValid ? new FragmentCursor(this) : FragmentCursor.dud) : null;
    }

    
    /**
     * Creates an unparsed TabFragment object that can be incrementally parsed 
     * by repeatedly calling the TabFragment.advance() method.
     * @param node source node from which parsing begins
     * @param editorState the EditorState from which the sourceNode was obtained
     * @returns an unparsed TabFragment object
     */
    static startParse(node: SyntaxNode, editorState: EditorState): TabFragment | null {
        if (node.name !== TabFragment.AnchorNodeType) return null;
        return new TabFragment(node.from, node.to, node, editorState.doc);
    }

    /**
     * Applies a set of edits to an array of fragments, reusing unaffected fragments,
     * removing fragments overlapping with edits, or creating new fragments with 
     * adjusted positions to replace fragments which have moved as a result of edits.
     * @param fragments a set of TabFragment objects
     * @param changes a set of ChangedRanges representing edits
     * @returns a new set of fragments
     */
    static applyChanges(fragments: readonly TabFragment[], changes: readonly ChangedRange[]) {
        if (!changes.length) return fragments;
        let result: TabFragment[] = [];
        let fI = 1, nextF = fragments.length ? fragments[0] : null;
        for (let cI = 0, off=0;nextF; cI++) {
            let nextC = cI < changes.length ? changes[cI] : null;
            // TODO: be careful here with the <=. test to make sure that it should be <= and not just <.
            while (nextF && (!nextC || nextF.from <= nextC.toA)) {
                if (!nextC || nextF.to<=nextC.fromA) result.push(nextF.createOffsetCopy(-off));
                nextF = fI < fragments.length ? fragments[fI++] : null;
            }
            off = nextC ? nextC.toA - nextC.toB : 0;
        }
        return result;
    }

    private createOffsetCopy(offset: number):TabFragment {
        const copy = new TabFragment(this.from+offset, this.to+offset, null!, null!);
        copy.linearParser = this.linearParser;
        return copy;
    }

    /**
     * Create a set of fragments from a freshly parsed tree, or update
     * an existing set of fragments by replacing the ones that overlap
     * with a tree with content from the new tree.
     * @param tree a freshly parsed tree
     * @param fragments a set of fragments
     * @returns fragment set produced by merging the tree's fragment set with the provided fragment set
     */
    static addTree(tree: TabTree, fragments: readonly TabFragment[] = []) {
        let result = [...tree.getFragments()];
        for (let f of fragments) if (f.to > tree.to) result.push(f);
        return result
    }
    
    static createBlankFragment(from: number, to: number) {
        return new TabFragment(from, to, null!, null!);
    }

    get cursor() {
        return this.isParsed ? this.advance() : null;
    }

    toString() {
        return this.cursor?.printTree() || "";
    }
    
    get isParsed() { return this.isBlankFragment || this.linearParser!.isDone }
}

