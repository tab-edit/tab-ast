import { EditorState } from "@codemirror/state";
import { ChangedRange, SyntaxNode } from "@lezer/common";
import { ASTNode, TabSegment } from "./nodes";
import { TabFragment } from "./TabFragment";

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

    Modifier = "Modifier",
    
    InvalidToken = "⚠"
}



export class TabTree {
    static ParseAnchor = TabFragment.name;

    constructor(readonly fragments: TabFragment[] = []) {}
    getFragments() { return this.fragments }
    static readonly empty = new TabTree();
}

