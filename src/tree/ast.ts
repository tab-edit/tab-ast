import { ChangedRange, SyntaxNode } from "@lezer/common";

export enum NodeNames {
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
    
    InvalidToken = "⚠",

    TabBlock = "TabBlock",
    NoteGroup = "NoteGroup"
}

export class TabFragment {
    // TODO: NOTE: Only the TabFragment has absolute position. 
    // the other AST Nodes positions are all relative to their 
    // TabFragment. That way, we can cache TabFragments and remove 
    // dirty TabFragments with minimal changes to the clean TabFragments. 
    // no need to go into their children to update the indices.
    from: number;
    to: number;
    get name() { return NodeNames.TabSegment }

    static parseFragment(node: SyntaxNode, source: string): TabFragment | null {
        if (node.from >= source.length || node.to > source.length) return null;
        if (node.name != TabTree.ParseAnchor) return null;
        
        const cursor = node.cursor;
    }

    /// Apply a set of edits to an array of fragments, removing or
    /// splitting fragments as necessary to remove edited ranges, and
    /// adjusting offsets for fragments that moved.
    static applyChanges(fragments: readonly TabFragment[], changes: readonly ChangedRange[], minGap = 128) {
        if (!changes.length) return fragments;
        let result: TabFragment[] = [];
        let fI = 1, nextF = fragments.length ? fragments[0] : null;
    }
}

export class TabTree {
    static ParseAnchor = TabFragment.name;

    constructor(fragments?: TabFragment[]) {
        if (!fragments) return;
        // TODO: implement method stub
    }

    static readonly empty = new TabTree();
}