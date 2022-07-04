// TODO: credit https://github.com/lezer-parser/common/blob/main/src/parse.ts
import { EditorState } from "@codemirror/state";
import { SourceNode, SourceNodeTypes } from "./nodes";
import { LinearParser } from "../parsers/node_level_parser";
import { ChangedRange, SyntaxNode } from "@lezer/common";
import { TabTree } from "./tree";
import { FragmentCursor } from "./cursors";
import { NodeBlueprint } from "../blueprint/blueprint";
import { ASTNode, NodeGenerator } from "./node-generator";

// TODO: consider replacing all occurences of editorState with sourceText where sourceText is editorState.doc
export class TabFragment {
    private constructor(
        readonly from: number,
        readonly to: number,
    ) {}

    private _nodeSet:ASTNode[]; 
    get nodeSet() { return this._nodeSet }
    advance(): FragmentCursor | null {
        if (this.isBlankFragment) return FragmentCursor.dud;
        this._nodeSet = this.linearParser.advance();
        return this._nodeSet ? new FragmentCursor(this) : null;
    }

    private blueprint: NodeBlueprint;
    private linearParser: LinearParser;
    /**
     * Creates an unparsed TabFragment object that can be incrementally parsed 
     * by repeatedly calling the TabFragment.advance() method.
     * @param node source node from which parsing begins
     * @param editorState the EditorState from which the sourceNode was obtained
     * @returns an unparsed TabFragment object
     */
    static startParse(node: SyntaxNode, editorState: EditorState, blueprint: NodeBlueprint): TabFragment | null {
        if (!blueprint.anchors.has(node.name)) return null;
        const fragment = new TabFragment(node.from, node.to)
        fragment.blueprint = blueprint;
        fragment.linearParser = new LinearParser(new SourceNode(node, fragment.from), new NodeGenerator(blueprint, editorState.doc));
    }

    private createOffsetCopy(offset: number):TabFragment {
        const copy = new TabFragment(this.from+offset, this.to+offset);
        copy.linearParser = this.linearParser;
        return copy;
    }

    get isBlankFragment() { return !this.linearParser }
    static createBlankFragment(from: number, to: number) {
        return new TabFragment(from, to);
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
    
    toString() {
        return new FragmentCursor(this).printTree() || "";
    }
    
    get isParsed() { return this.isBlankFragment || this.linearParser!.isDone }
}

