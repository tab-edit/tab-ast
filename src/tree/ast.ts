import { SyntaxNode } from "@lezer/common";

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
    from: number;
    to: number;
    get name() { return NodeNames.TabSegment }

    static parseFragment(node: SyntaxNode, source: string): TabFragment | null {
        if (node.from >= source.length || node.to > source.length) return null;
        if (node.name != TabTree.ParseAnchor) return null;
        
        const cursor = node.cursor;

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