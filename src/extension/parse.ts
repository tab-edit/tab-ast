import { ensureSyntaxTree, syntaxTree, syntaxTreeAvailable } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import { TabFragment, TabTree } from "../tree/TabFragment";

class Range {
    constructor(readonly from: number, readonly to: number) {}
}
export abstract class TabParser {
    /// Start a parse for a single tree. Called by `startParse`,
    /// with the optional arguments resolved.
    abstract createParse(editorState: EditorState, fragments: readonly TabFragment[], ranges: readonly {
        from: number;
        to: number;
    }[]): PartialTabParse;

    /// Start a parse, returning a tab partial parse
    /// object. fragments can be passed in to
    /// make the parse incremental.
    ///
    /// By default, the entire input is parsed. You can pass `ranges`,
    /// which should be a sorted array of non-empty, non-overlapping
    /// ranges, to parse only those ranges. The tree returned in that
    /// case will start at `ranges[0].from`.
    startParse(
        editorState: EditorState,
        fragments?: readonly TabFragment[],
        ranges?: readonly {from: number, to: number}[]
    ): PartialTabParse {
        ranges = !ranges ? [new Range(0, editorState.doc.length)] : ranges.length ? ranges.map(r => new Range(r.from, r.to)) : [new Range(0, 0)];
        return this.createParse(editorState, fragments || [], ranges);
    }

    /// Run a full parse, returning the resulting tree.
    parse(editorState: EditorState, fragments?: readonly TabFragment[], ranges?: readonly {
        from: number;
        to: number;
    }[]): TabTree {
        let parse = this.startParse(editorState, fragments, ranges);
        for(;;) {
            let done = parse.advance(100);
            if (done.tree) return done.tree;
        }
    }
}

// TODO: think of a better name for this class
export class TabParserImplement extends TabParser {
    createParse(editorState: EditorState, fragments: readonly TabFragment[], ranges: readonly {from: number, to: number}[]): PartialTabParse {
        return new PartialTabParseImplement(editorState, fragments || [], ranges);
    }
}


export interface PartialTabParse {
    
    /// This parser is dependent on another parser.
    /// parameters:
    ///     * catchupTimeout - if the dependent parser has not caught up, do not do more than this amount of work to catch it up
    /// returns {blocked:boolean, tree:TabTree|null}
    ///     * blocked - is this parser blocked waiting for the other parser it is dependent on?
    ///     * tree - the TabTree when the parse completes and null otherwise
    advance(catchupTimeout?: number): {blocked:boolean, tree: TabTree|null};
    
    
    /// The position up to which the document has been parsed.
    readonly parsedPos: number;

    /// Tell the parse to not advance beyond the given position.
    /// `advance` will return a tree when the parse has reached the
    /// position. Note that, depending on the parser algorithm and the
    /// state of the parse when `stopAt` was called, that tree may
    /// contain nodes beyond the position. It is not allowed to call
    /// `stopAt` a second time with a higher position.
    stopAt(pos: number): void;

    /// Reports whether `stopAt` has been called on this parse.
    readonly stoppedAt: number | null;

    getFragments(): TabFragment[];
}

// TODO: Think of a better name for this class
export class PartialTabParseImplement implements PartialTabParse {
    stoppedAt: number | null = null;
    private fragments: TabFragment[] = [];
    private to: number;
    private text: string;
    parsedPos: number;

    getFragments() {
        return this.fragments;
    }

    /// @internal
    constructor(
        private editorState: EditorState,
        private cachedFragments: readonly TabFragment[],
        readonly ranges: readonly {from: number, to: number}[]
    ) {
        this.editorState = editorState;
        this.text = editorState.doc.toString();
        this.to = ranges[ranges.length - 1].to;
        this.parsedPos = ranges[0].from;
    }

    advance(catchupTimeout: number = 25): {blocked:boolean, tree: TabTree|null} {
        if (this.fragments[this.fragments.length-1].isInvalid) this.fragments.pop();
        if (this.stoppedAt != null && this.parsedPos > this.stoppedAt)
            return {blocked: false, tree: this.finish()};

        if (!syntaxTreeAvailable(this.editorState, this.parsedPos)) {
            if (catchupTimeout > 0) 
                ensureSyntaxTree(this.editorState, this.parsedPos, catchupTimeout);
            return {blocked: true, tree: null};
        }

        if (!this.fragments[this.fragments.length-1].isParsed) {
            this.fragments[this.fragments.length-1].advance();
            return {blocked: false, tree: null};
        }
        if (this.cachedFragments && this.reuseFragment(this.parsedPos)) return {blocked: false, tree: null}
            
        let rawParseTree = syntaxTree(this.editorState);
        let node = (rawParseTree.resolve(this.parsedPos,1) as SyntaxNode);
        let curr = node.cursor;
        //look for TabSegment at this position and add it to parse tree
        while(curr.name!=TabTree.ParseAnchor && curr.parent()) {}
        if (curr.name!=TabTree.ParseAnchor) {
            this.parsedPos = node.to;
            return {blocked: false, tree: null};
        }
        let frag = TabFragment.startParse(curr.node, this.editorState);
        if (frag) this.fragments.push(frag);
        this.parsedPos = curr.to;
        return {blocked: false, tree: null};
    }

    stopAt(pos: number) {
        if (this.stoppedAt != null && this.stoppedAt < pos) throw new RangeError("Can't move stoppedAt forward");
        this.stoppedAt = pos;
    }

    private finish() {
        //TODO: create the user-visible tree and return it.
        return new TabTree(this.fragments);
    }

    private reuseFragment(start: number) {
        for (let fI=0; fI<this.cachedFragments.length; fI++) {
            if (this.cachedFragments[fI].from > start) break;
            if (this.cachedFragments[fI].to > start) {
                this.fragments.push(this.cachedFragments[fI]);
                this.parsedPos = this.cachedFragments[fI].to;
                return true;
            }
        }
        return false;
    }
}