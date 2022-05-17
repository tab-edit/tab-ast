import { TabTreeCursor } from "./cursors";
import { TabFragment } from "./fragment";
import { AnchoredASTNode, ResolvedASTNode } from "./nodes";

export class TabTree {
    readonly from: number;
    readonly to: number;
    constructor(readonly fragments: TabFragment[]) {
        this.from = fragments[0] ? fragments[0].from : 0;
        this.to = fragments[fragments.length-1] ? fragments[fragments.length-1].to : 0;
    }

    get cursor() {
        return TabTreeCursor.from(this.fragments);
    }

    static createBlankTree(from: number, to: number) {
        return new TabTree([TabFragment.createBlankFragment(from, to)]);
    }

    getFragments() { return this.fragments }

    /// Iterate over the tree and its children in an in-order fashion
    /// calling the spec.enter() function whenever a node is entered, and 
    /// spec.leave() when we leave a node. When enter returns false, that 
    /// node will not have its children iterated over (or leave called).
    iterate(spec: IteratorSpec) {
        this.iterateHelper(spec, this.cursor);
    }

    private iterateHelper(spec: IteratorSpec, cursor: TabTreeCursor) {
        let explore: boolean | undefined;
        do {
            explore = spec.enter(cursor.node)===false ? false : true;
            if (explore===false) continue;
            if (cursor.firstChild()) {
                this.iterateHelper(spec, cursor);
                cursor.parent();
            }
            if (spec.leave) spec.leave(cursor.node);
        }while (cursor.nextSibling());
    }

    static readonly empty = new TabTree([]);
    toString() {
        let str = "TabTree("
        for (let fragment of this.fragments) {
            str += fragment.toString();
        }
        str += ")"
        return str;
    }
}



type IteratorSpec = {
    enter: (
        node: ResolvedASTNode
    ) => false | void,
    leave?: (
        node: ResolvedASTNode
    ) => void,
    from?: number,
    to?: number
};