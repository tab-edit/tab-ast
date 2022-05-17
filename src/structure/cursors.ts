import { SyntaxNode, TreeCursor } from "@lezer/common";
import { TabFragment } from "./fragment";
import { AnchoredSyntaxNode, ResolvedASTNode } from "./nodes";

export interface Cursor<T> {
    name: string;
    node: Readonly<T>;
    firstChild(): boolean;
    lastChild(): boolean;
    parent(): boolean;
    prevSibling(): boolean;
    nextSibling(): boolean;
    fork(): Cursor<T>;
}

export class TabTreeCursor implements Cursor<ResolvedASTNode> {
    private currentCursor: FragmentCursor;
    private constructor(
        private fragSet: TabFragment[],
        private pointer: number = 0,
    ) {
        this.currentCursor = fragSet[pointer].cursor;
    }
    public static from(fragSet: TabFragment[], startingPos?: number) {
        if (!fragSet || !fragSet.length) return null;
        return new TabTreeCursor(fragSet, startingPos || 0);
    }
    get name() { return this.currentCursor.name }
    get node() { return this.currentCursor.node }
    getAncestors() { return this.currentCursor; }
    firstChild() { return this.currentCursor.firstChild() }
    lastChild() { return this.currentCursor.lastChild() }
    parent() { return this.currentCursor.parent() }
    prevSibling() {
        if (!this.currentCursor.fork().parent() && this.pointer>0) {
            this.pointer = this.pointer-1;
            this.currentCursor = this.fragSet[this.pointer].cursor;
            return true;
        }
        return this.currentCursor.prevSibling();
    }
    nextSibling() {
        if (!this.currentCursor.fork().parent() && this.pointer+1 < this.fragSet.length) {
            this.pointer = this.pointer+1;
            this.currentCursor = this.fragSet[this.pointer].cursor;
            return true;
        }
        return this.currentCursor.nextSibling();
    }
    fork() { 
        const copy = new TabTreeCursor(this.fragSet, this.pointer);
        copy.currentCursor = this.currentCursor;
        return copy;
    }
}

export class FragmentCursor implements Cursor<ResolvedASTNode> {
    private ancestryTrace: number[] = [];
    private pointer: number = 0;

    constructor(readonly fragment: TabFragment) {}
    get name() { return this.fragment.nodeSet[this.pointer].name }
    get node() { 
        // TODO: could improve efficiency by implementing some sort of caching. This would
        // snowball because the ResolvedASTNode class caches a bunch of values, so
        // performance benefits might be more than meets the eye
        return new ResolvedASTNode(this.fragment.nodeSet[this.pointer], this);
    }

    getAncestors() {
        return this.node.getAncestors();
    }

    firstChild() {
        if (this.fragment.nodeSet.length===0) return false;
        let currentPointer = this.pointer;
        if (this.fragment.nodeSet[this.pointer].length===1) return false;
        this.pointer+=1;
        this.ancestryTrace.push(currentPointer);
        return true;
    }

    lastChild() {
        if (!this.firstChild()) return false;
        while (this.nextSibling()) {}
        return true;
    }

    parent() {
        if (this.fragment.nodeSet.length===0) return false;
        if (this.name===TabFragment.name || this.ancestryTrace.length===0) return false;
        this.pointer = this.ancestryTrace[this.ancestryTrace.length-1];
        this.ancestryTrace.pop();
        return true;
    }

    prevSibling() {
        let currentPointer = this.pointer;
        if (!this.parent()) return false;

        this.firstChild();
        let prevSiblingPointer = this.pointer;
        if (prevSiblingPointer===currentPointer) return false;

        while (this.nextSibling() && this.pointer!==currentPointer) {
            prevSiblingPointer = this.pointer;
        }
        this.pointer = prevSiblingPointer;
        return true;
    }

    nextSibling() {
        if (!this.ancestryTrace.length) return false
        let parentPointer = this.ancestryTrace[this.ancestryTrace.length-1];

        let nextInorder = this.pointer + this.fragment.nodeSet[this.pointer].length;
        if (parentPointer+this.fragment.nodeSet[parentPointer].length <= nextInorder) return false;
        this.pointer = nextInorder;
        return true;
    }

    fork() {
        const copy = new FragmentCursor(this.fragment);
        copy.pointer = this.pointer;
        copy.ancestryTrace = this.ancestryTrace;
        return copy;
    }

    static readonly dud =  new FragmentCursor(TabFragment.createBlankFragment(0,0));

    printTree() {
        let str = this.printTreeRecursiveHelper();
        return str;
    }
    private printTreeRecursiveHelper() {
        if (this.fragment.nodeSet.length==0) return "";
        let str = `${this.fragment.nodeSet[this.pointer].name}[${this.fragment.nodeSet[this.pointer].ranges.toString()}]`;
        if (this.firstChild()) str += "(";
        else return str;
        let first = true;
        do {
            if (!first) str += ",";
            first = false;
            str += this.printTreeRecursiveHelper();
        } while (this.nextSibling());
        str += ")";
        this.parent();
        return str;
    }
}




// Don't know when we will use this, but it is for the user to 
// be able to access and traverse the raw syntax nodes while 
// still maintaining the fact that all nodes' positions are 
// relative to the TabFragment in which they are contained.
/**
 * Creates a cursor for SyntaxNodes which are anchored to the node provided
 * in the constructor (you can only explore the sub-tree rooted atthe provided
 * starting node, not its siblings or ancestors)
 */
export class AnchoredSyntaxCursor implements Cursor<AnchoredSyntaxNode> {
    private cursor: TreeCursor;
    constructor(
        private anchorNode: SyntaxNode,
        private anchorOffset: number,
    ) {
        this.cursor = anchorNode.cursor();
    }
    
    get type() { return this.cursor.type }
    get name() { return this.cursor.name }
    get from() { return this.cursor.from - this.anchorOffset }
    get to() { return this.cursor.to - this.anchorOffset }
    get node() { return new AnchoredSyntaxNode(this.cursor.node, this.anchorOffset); }
    firstChild() { return this.cursor.firstChild() }
    lastChild() { return this.cursor.lastChild() }
    enter(
        pos: number,
        side: -1 | 0 | 1
    ) {
        return this.cursor.enter(pos, side);
    }
    parent() {
        if (this.name===TabFragment.AnchorNodeType || this.cursorAtAnchor()) return false;
        return this.cursor.parent();
    }
    nextSibling() {
        if (this.name===TabFragment.AnchorNodeType || this.cursorAtAnchor()) return false;
        return this.cursor.nextSibling();
    }
    prevSibling() {
        if (this.name===TabFragment.AnchorNodeType || this.cursorAtAnchor()) return false;
        return this.cursor.nextSibling();
    }
    fork() {
        return new AnchoredSyntaxCursor(this.cursor.node, this.anchorOffset);
    }
    private cursorAtAnchor() {
        return this.name == this.anchorNode.name && this.from == this.anchorNode.from && this.to == this.anchorNode.to;
    }
}
