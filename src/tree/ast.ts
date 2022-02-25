import { ChangedRange, SyntaxNode } from "@lezer/common";

export enum SyntaxNodeTypes {
    Tablature = "Tablature",
    TabSegment = "TabSegment",
    TabSegmentLine = "TabSegmentLine",
    TabString = "TabString",
    MeasureLineName = "MeasureLineName",
    MeasureLine = "MeasureLine",

    Hammer = "Hammer",
    Pull = "Pull",
    Slide = "Slide",
    Fret = "Fret",
    Harmonic = "Harmonic",
    Grace = "Frace",
    Comment = "Comment",

    RepeatLine = "RepeatLine",
    Repeat = "Repeat",
    Multiplier = "Multiplier",
    TimeSignature = "TimeSignature",
    TimeSigLine = "TimeSigLine",
    TimingLine = "TimingLine",
    
    InvalidToken = "⚠"
}

export class TabFragment {
    // TODO: NOTE: Only the TabFragment has absolute position. 
    // the other AST Nodes positions are all relative to their 
    // TabFragment. That way, we can cache TabFragments and remove 
    // dirty TabFragments with minimal changes to the clean TabFragments. 
    // no need to go into their children to update the indices.
    get name() { return SyntaxNodeTypes.TabSegment }

    constructor(
        readonly from: number,
        readonly to: number,
        private partial:boolean = false
    ) {}

    isPartial() { return this.partial }

    /// starts parsing this TabFragment from the raw SyntaxNode. this is made to be 
    /// incremental to prevent blocking when there are a lot of Tab Blocks on the same line
    // TODO: figure out how the heck to make this incremental
    static startParse(node: SyntaxNode, source: string): TabFragment | null {
        if (node.from >= source.length || node.to > source.length) return null;
        if (node.name != TabTree.ParseAnchor) return null;
        
        const cursor = node.cursor;
        return new TabFragment(node.from, node.to, true);
    }


    advance():boolean {
        // TODO: implement method stub

        this.partial = false; // only when all your children are done do you say this.partial = false
        return this.partial;
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

    offset(delta):TabFragment|null {
        if (this.from+delta < 0) return null;
        return new TabFragment(this.from+delta, this.to+delta); // TODO: copy over children nodes. it should be a clone of `this`, aside from the from and to values
    }
}

export class TabTree {
    static ParseAnchor = TabFragment.name;

    constructor(readonly fragments: TabFragment[] = []) {}
    getFragments() { return this.fragments }
    static readonly empty = new TabTree();
}
// store the from/to's of multiline nodes like Measure as just an array of integers. e.g. [1,2,6,7,9,12] ranges over 3 lines and on the first line, it goes from 1-2. on the second, from 6-7. e.t.c.
// TODO: IDEA: we need to be able to traverse nodes and their parents efficiently. we store each node as an array.
//      we only store the bare minimal we need to store for each node object - its range(s) and number of children it has.
//      to traverse, we have a separate array of integers called stack. it will store the ancestry stack as the index of the ancestor nodes.
//      so to get a node's parent is easy.
//      we can know where we are at any point because we know our parent's index, and we know our index, and we know how many children our parent has, so we can also figure out how many children our parent has left to go pretty easily