import { EditorState } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import { AnchoredSyntaxCursor } from "./cursors";
export declare enum SyntaxNodeTypes {
    Tablature = "Tablature",
    TabSegment = "TabSegment",
    TabSegmentLine = "TabSegmentLine",
    TabString = "TabString",
    MeasureLineName = "MeasureLineName",
    MeasureLine = "MeasureLine",
    Note = "Note",
    NoteDecorator = "NoteDecorator",
    NoteConnector = "NoteConnector",
    ConnectorSymbol = "ConnectorSymbol",
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
    InvalidToken = "\u26A0"
}
export interface SingleSpanNode {
    getRootNodeTraverser(): AnchoredSyntaxCursor | null;
}
export declare abstract class ASTNode {
    protected sourceNodes: {
        [type: string]: SyntaxNode[];
    };
    readonly offset: number;
    get isSingleSpanNode(): boolean;
    ranges: Uint16Array;
    constructor(sourceNodes: {
        [type: string]: SyntaxNode[];
    }, offset: number);
    get name(): string;
    protected parsed: boolean;
    get isParsed(): boolean;
    parse(editorState: EditorState): ASTNode[];
    protected abstract createChildren(editorState: EditorState): ASTNode[];
    protected disposeSourceNodes(): void;
    private _length;
    increaseLength(children: ASTNode[]): void;
    get length(): number;
    protected computeRanges(sourceNodes: {
        [type: string]: SyntaxNode[];
    }, offset: number): number[];
}
export declare class TabSegment extends ASTNode implements SingleSpanNode {
    getRootNodeTraverser(): AnchoredSyntaxCursor;
    protected createChildren(editorState: EditorState): TabBlock[];
    private lineDistance;
}
export declare class TabBlock extends ASTNode {
    protected createChildren(): ASTNode[];
}
export declare class Measure extends ASTNode {
    protected createChildren(editorState: EditorState): Sound[];
    private charDistance;
}
export declare class Sound extends ASTNode {
    protected createChildren(): ASTNode[];
}
export declare abstract class NoteConnector extends ASTNode implements SingleSpanNode {
    abstract getType(): string;
    private notes;
    getRootNodeTraverser(): AnchoredSyntaxCursor;
    protected computeRanges(sourceNodes: {
        [type: string]: SyntaxNode[];
    }, offset: number): any[];
    private getNotesFromNoteConnector;
    protected createChildren(): Note[];
    static isNoteConnector(name: string): boolean;
    static from(type: string, sourceNodes: {
        [type: string]: SyntaxNode[];
    }, offset: number): NoteConnector;
}
export declare class Hammer extends NoteConnector {
    getType(): SyntaxNodeTypes;
}
export declare class Pull extends NoteConnector {
    getType(): SyntaxNodeTypes;
}
export declare class Slide extends NoteConnector {
    getType(): SyntaxNodeTypes;
}
export declare abstract class NoteDecorator extends ASTNode implements SingleSpanNode {
    abstract getType(): string;
    getRootNodeTraverser(): AnchoredSyntaxCursor;
    protected createChildren(): ASTNode[];
    static from(type: string, sourceNodes: {
        [type: string]: SyntaxNode[];
    }, offset: number): NoteDecorator;
}
export declare class Grace extends NoteDecorator {
    getType(): SyntaxNodeTypes;
}
export declare class Harmonic extends NoteDecorator {
    getType(): SyntaxNodeTypes;
}
export declare abstract class Note extends ASTNode implements SingleSpanNode {
    abstract getType(): string;
    protected createChildren(): any[];
    getRootNodeTraverser(): AnchoredSyntaxCursor;
    static from(type: string, sourceNodes: {
        [type: string]: SyntaxNode[];
    }, offset: number): Note;
}
export declare class Fret extends Note {
    getType(): string;
}
