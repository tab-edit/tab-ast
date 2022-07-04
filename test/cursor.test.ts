import { FragmentCursor } from "../src/structure/cursors";
import { TabFragment } from "../src/structure/fragment";
import { ASTNode } from "../src/structure/node-generator";

describe("FragmentCursor", () => {
    let fragment:TabFragment;
    test("should get correct first child", () => {
        const cursor = initializeCursor("a[bcdef]")

        expect(cursor.firstChild()).toBe(true);
        expect(cursor.name).toBe("b");

        expect(cursor.firstChild()).toBe(false);
        expect(cursor.name).toBe("b");
    })

    test("should get correct ancestors", () => {
        const cursor = initializeCursor("a[bc[d]ef[g[hi]]j]");
        let ancestorNames = (cursor: FragmentCursor) => cursor.getAncestors().map(node => node.name);

        expect(ancestorNames(cursor)).toHaveLength(0);

        cursor.firstChild();
        expect(ancestorNames(cursor)).toEqual(["a"]);

        cursor.nextSibling();
        cursor.firstChild();
        expect(ancestorNames(cursor)).toEqual(['a', 'c']);

        cursor.parent();
        cursor.nextSibling();
        cursor.nextSibling();
        cursor.firstChild();
        cursor.firstChild();

        expect(ancestorNames(cursor)).toEqual(['a', 'f', 'g']);
    })

    test("should get correct next sibling", () => {
        const cursor = initializeCursor("a[bc[d]e]");
        // at root of tree
        expect(cursor.nextSibling()).toBe(false);
        expect(cursor.name).toBe("a");

        // siblings next to each other in array
        cursor.firstChild();
        expect(cursor.nextSibling()).toBe(true);
        expect(cursor.name).toBe("c");

        // skipping descendants
        expect(cursor.nextSibling()).toBe(true);
        expect(cursor.name).toBe("e");

        // last child has no next sibling
        cursor.prevSibling();
        cursor.firstChild();
        expect(cursor.nextSibling()).toBe(false);
        expect(cursor.name).toBe('d');

    })

    test("should get correct prev sibling", () => {
        const cursor = initializeCursor("a[bc[d]e]");
        // at root of tree
        expect(cursor.prevSibling()).toBe(false);
        expect(cursor.name).toBe('a');

        // first child of its parent
        cursor.firstChild();
        expect(cursor.prevSibling()).toBe(false);
        expect(cursor.name).toBe('b');

        // skipping across sibling's children (in this case, skipping 'd')
        cursor.nextSibling();
        cursor.nextSibling();

        expect(cursor.prevSibling()).toBe(true);
        expect(cursor.name).toBe('c');
    })

    test("should get correct parent", () => {
        const cursor = initializeCursor("a[bc[d]e]");
        // root node has no parent
        expect(cursor.parent()).toBe(false);
        expect(cursor.name).toBe('a');

        // parent is the root node
        cursor.firstChild();
        cursor.nextSibling();
        expect(cursor.parent()).toBe(true);
        expect(cursor.name).toBe('a')

        // parent is not the root node
        cursor.firstChild();
        cursor.nextSibling();
        cursor.firstChild();
        expect(cursor.parent()).toBe(true);
        expect(cursor.name).toBe('c');
    })

})


function initializeCursor(structure:string) {
    const fragment = TabFragment.createBlankFragment(0,0);
    fragment['_nodeSet'] = createDummyNodeset(structure);  // private member access
    return new FragmentCursor(fragment);
}

/**
 * builds a linear tree structure with dummy string of the following structure:
 * x[yyy[zz]y]
 * represents this tree structure
 *      x
 *  /  / \  \
 * y  y   y  y
 *       / \
 *      z   z
 * but in a linear in-order array data-structure
 * @param structure string describing the structure of the dummy array tree. example string: "x[xx[x]xxx]"
 */
function createDummyNodeset(structure: string) {
    const charSet = structure.split('');

    const ancestorTrace:ASTNode[] = []
    const nodeSet:ASTNode[] = [];
    charSet.forEach(char => {
        if (char=='[' && nodeSet[nodeSet.length-1]) {
            ancestorTrace.push(nodeSet[nodeSet.length-1])
        }else if (char==']') {
            ancestorTrace.pop();
        }else if (char.match(/[a-zA-Z]/)) {
            let dummyNode = new ASTNode(char, [], {});
            nodeSet.push(dummyNode);
            for(const node of ancestorTrace) node.increaseDecendantCount([dummyNode]);
        }
    })
    return nodeSet;
}