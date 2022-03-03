import { SyntaxNode, TreeCursor } from "@lezer/common";
import { ASTNode, SingleSpanNode } from "./nodes";
import { TabFragment } from "./tab_fragment";

interface Cursor {
    name: string;
    node: Readonly<ASTNode> | Readonly<OffsetSyntaxNode>;
    firstChild(): boolean;
    lastChild(): boolean;
    parent(): boolean;
    prevSibling(): boolean;
    nextSibling(): boolean;
}

export class FragmentCursor implements Cursor {
    private constructor(
        private nodeSet: ASTNode[],
        private pointer: number = 0,
        private ancestryTrace: number[] = []
    ) {}
    public static from(nodeSet: ASTNode[]) {
        if (!nodeSet || !nodeSet.length) return null;
        return new FragmentCursor(nodeSet, 0, []);
    }

    get name() { return this.nodeSet[this.pointer].name }
    get node() { return Object.freeze(this.nodeSet[this.pointer]) }
    sourceSyntaxNode() { return (<SingleSpanNode> <unknown> this.nodeSet[this.pointer])?.getRootNodeTraverser() || null }

    firstChild() {
        if (this.nodeSet.length==0) return false;
        let currentPointer = this.pointer;
        if (this.nodeSet[this.pointer].length==1) return false;
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
        if (this.nodeSet.length==0) return false;
        if (this.name==TabFragment.name || this.ancestryTrace.length==0) return false;
        this.pointer = this.ancestryTrace[this.ancestryTrace.length-1];
        this.ancestryTrace.pop();
        return true;
    }

    prevSibling() {
        let currentPointer = this.pointer;
        if (!this.parent()) return false;

        this.firstChild();
        let prevSiblingPointer = this.pointer;
        if (prevSiblingPointer==currentPointer) return false;

        while (this.nextSibling() && this.pointer!=currentPointer) {
            prevSiblingPointer = this.pointer;
        }
        this.pointer = prevSiblingPointer;
        return true;
    }

    nextSibling() {
        if (!this.ancestryTrace.length) return false
        let parentPointer = this.ancestryTrace[this.ancestryTrace.length-1];

        let nextInorder = this.pointer + this.nodeSet[this.pointer].length;
        if (parentPointer+this.nodeSet[parentPointer].length <= nextInorder) return false;
        this.pointer = nextInorder;
        return true;
    }
    fork() {
        return new FragmentCursor(this.nodeSet, this.pointer, this.ancestryTrace);
    }

    static readonly dud =  new FragmentCursor([]);

    printTree() {
        let str = this.printTreeRecursiveHelper();
        return str;
    }
    private printTreeRecursiveHelper() {
        let str = `${this.nodeSet[this.pointer].name}`;
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
export class AnchoredSyntaxCursor implements Cursor {
    private cursor: TreeCursor;
    constructor(
        startingNode: SyntaxNode,
        private anchorOffset: number,
    ) {
        this.cursor = startingNode.cursor;
    }
    
    get type() { return this.cursor.type }
    get name() { return this.cursor.name }
    get from() { return this.cursor.from - this.anchorOffset }
    get to() { return this.cursor.to - this.anchorOffset }
    get node() { return Object.freeze(new OffsetSyntaxNode(this.cursor.node, this.anchorOffset)); }
    firstChild() { return this.cursor.firstChild() }
    lastChild() { return this.cursor.lastChild() }
    enter(
        pos: number,
        side: -1 | 0 | 1,
        overlays: boolean = true,
        buffers: boolean = true
    ) {
        return this.cursor.enter(pos, side, overlays, buffers);
    }
    parent() {
        if (this.name==TabFragment.AnchorNode) return false;
        return this.cursor.parent();
    }
    nextSibling() {
        if (this.name==TabFragment.AnchorNode) return false;
        return this.cursor.nextSibling();
    }
    prevSibling() {
        if (this.name==TabFragment.AnchorNode) return false;
        return this.cursor.nextSibling();
    }
}

class OffsetSyntaxNode {
    constructor(
        private node: SyntaxNode, 
        private offset: number
    ) {}

    get type() { return this.node.type }
    get name() { return this.node.name }
    get from() { return this.node.from - this.offset }
    get to() { return this.node.to - this.offset }
}