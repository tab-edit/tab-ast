// TODO: credit https://github.com/lezer-parser/markdown/blob/main/src/markdown.ts
import { ensureSyntaxTree, Language, syntaxTree, syntaxTreeAvailable } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import { SyntaxNodeTypes } from "../tree/nodes";
import { TabFragment, TabTree } from "../tree/tab_fragment";
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
        if (this.fragments.length!==0 && !this.fragments[this.fragments.length-1].isParsed) {
            this.fragments[this.fragments.length-1].advance();
            return {blocked: false, tree: null};
        }
        if (this.stoppedAt !== null && this.parsedPos > this.stoppedAt)
            return {blocked: false, tree: this.finish()};
            
        if (this.parsedPos >= this.editorState.doc.length)
            return {blocked: false, tree: this.finish()}

        let rawSyntaxTree = ensureSyntaxTree(this.editorState, this.parsedPos, catchupTimeout);
        if (!rawSyntaxTree) return {blocked: true, tree: null}

        // TODO: we should probably not make reusing a fragment one single action because that creates a lot of overhead. we can quickly reuse multiple items, but doing it one by one wastes resources
        if (this.cachedFragments && this.reuseFragment(this.parsedPos)) return {blocked: false, tree: null}
        // TODO: maybe handle case here where we may not want to reuse fragment because the fragment has been changed from what it actually is (maybe the rawparsetree didn't parse teh full tabsegment last time so we want to replace it with newly, fully parsed tab segment)
            
        let cursor = rawSyntaxTree.cursor();
        if (this.parsedPos===cursor.to) // we're at the end of partially-parsed raw syntax tree.
            return {blocked: true, tree: null}

        let endOfSyntaxTree = !cursor.firstChild();
        while (cursor.to <= this.parsedPos && !endOfSyntaxTree) {
            if ((endOfSyntaxTree = !cursor.nextSibling())) break;
        }

        let skipTo: number | null = null;
        if (endOfSyntaxTree) {   // end of partial syntax tree
            skipTo = rawSyntaxTree.cursor().to;
        } else if (cursor.from > this.parsedPos) {  // no node covers this.parsedPos (maybe it was skipped when parsing, like whitespace)
            skipTo = cursor.from;
        } else if (cursor.name!==TabFragment.AnchorNode) {
            skipTo = cursor.to;
        }

        if (skipTo) {
            skipTo = (cursor.from==cursor.to) ? skipTo+1 : skipTo; // for zero-width error nodes, prevent being stuck in loop.
            let prevFrag = this.fragments[this.fragments.length-1];
            let blankFrag:TabFragment;
            if (prevFrag && prevFrag.isBlankFragment) {
                // combine consecutive blank fragments into one.
                blankFrag = TabFragment.createBlankFragment(prevFrag.from, skipTo);;
                this.fragments[this.fragments.length-1] = blankFrag;
            } else {
                blankFrag = TabFragment.createBlankFragment(this.parsedPos, skipTo);
                this.fragments.push(blankFrag);
            }
            this.parsedPos = skipTo;
            return {blocked: false, tree: null};
        }

        let frag = TabFragment.startParse(cursor.node, this.editorState)!;
        this.fragments.push(frag);
        this.parsedPos = cursor.to;
        return {blocked: false, tree: null};
    }

    stopAt(pos: number) {
        if (this.stoppedAt !== null && this.stoppedAt < pos) throw new RangeError("Can't move stoppedAt forward");
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
                if (this.cachedFragments[fI].isBlankFragment) {
                    // there might be a range overlap in the end of a 
                    // skipping fragment with the start of the subsequent, 
                    // proper fragment, so to make sure that we do not select 
                    // the skipping fragment instead of the proper fragment, we confirm
                    if (fI<this.cachedFragments.length-1 
                        && !this.cachedFragments[fI+1].isBlankFragment 
                        && this.cachedFragments[fI+1].from <= start
                    ) fI++;
                }
                this.fragments.push(this.cachedFragments[fI]);
                this.parsedPos = this.cachedFragments[fI].to;
                return true;
            }
        }
        return false;
    }
}