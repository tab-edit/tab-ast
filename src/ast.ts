//TODO give credit to https://github.com/codemirror/language/blob/main/src/language.ts
import { ChangeDesc, EditorState, Facet, StateEffect, StateField, Transaction } from "@codemirror/state";
import { EditorView, logException, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { ChangedRange } from "@lezer/common";
import { TabParser, PartialTabParse } from "./extension/parse";
import { TabFragment, TabTree } from "./tree/ast";

class TabAST {
    // TODO

    /// @internal
    static state: StateField<ASTState>;

    ///@internal
    static setState = StateEffect.define<ASTState>();
}

const enum Work {
    // Milliseconds of work time to perform immediately for a state doc change
    Apply = 20,
    // Minimum amount of work time to perform in an idle callback
    MinSlice = 25,
    // Amount of work time to perform in pseudo-thread when idle callbacks aren't supported
    Slice = 100,
    // Minimum pause between pseudo-thread slices
    MinPause = 100,
    // Maximum pause (timeout) for the pseudo-thread
    MaxPause = 500,
    // Parse time budgets are assigned per chunk—the parser can run for
    // ChunkBudget milliseconds at most during ChunkTime milliseconds.
    // After that, no further background parsing is scheduled until the
    // next chunk in which the editor is active.
    ChunkBudget = 3000,
    ChunkTime = 30000,
    // For every change the editor receives while focused, it gets a
    // small bonus to its parsing budget (as a way to allow active
    // editors to continue doing work).
    ChangeBonus = 50,
    // Don't eagerly parse this far beyond the end of the viewport
    MaxParseAhead = 1e5,
    // When initializing the state field (before viewport info is
    // available), pretend the viewport goes from 0 to here.
    InitViewport = 3000,
}

let currentContext: ParseContext | null = null;

/// A parse context provided to parsers working on the editor content.
class ParseContext  {
    private parse: PartialTabParse | null = null;
    /// @internal
    tempSkipped: {from: number, to: number}[] = [];

    /// @internal
    constructor(
        private parser: TabParser,
        /// The current editor state.
        readonly state: EditorState,
        /// Tree fragments that can be reused by incremental re-parses
        public fragments: readonly TabFragment[] = [],
        /// @internal
        public tree: TabTree,
        public treeLen: number,
        /// The current editor viewport (or some overapproximation
        /// thereof). Intended to be used for opportunistically avoiding
        /// work (in which case
        /// [`skipUntilInView`](#language.ParseContext.skipUntilInView)
        /// should be called to make sure the parser is restarted when the
        /// skipped region becomes visible).
        public viewport: {from: number, to: number},
        /// @internal
        public skipped: {from: number, to:number}[],
        /// This is where skipping parsers can register a promise that,
        /// when resolved, will schedule a new parse. It is cleared when
        /// the parse worker picks up the promise. @internal
        public scheduleOn: Promise<unknown> | null
    ) {}
    
    private startParse() {
        return this.parser.startParse(this.state, this.fragments);
    }

    /// @internal
    work(time: number, upto?: number) {
        if (upto != null && upto >= this.state.doc.length) upto = undefined;
        if (this.tree != TabTree.empty && this.isDone(upto ?? this.state.doc.length)) {
            this.takeTree();
            return true;
        }
        return this.withContext(() => {
            let endTime = Date.now() + time;
            if (!this.parse) this.parse = this.startParse();
            if (upto != null && (this.parse.stoppedAt == null || this.parse.stoppedAt > upto) &&
                upto < this.state.doc.length) this.parse.stopAt(upto);
            for(;;) {
                let {blocked, tree} = this.parse.advance();
                if (blocked) return false;
                if (tree!=null) {
                    // TODO: this.fragments = this.withoutTempSkipped(TabFragment.addTree(tree, this.fragments, this.parse.stoppedAt != null)); also consider incorporating this.fragments = this.parse.getFragments()
                    this.treeLen = this.parse.stoppedAt ?? this.state.doc.length;
                    this.tree = tree;
                    this.parse = null;
                    if (this.treeLen < (upto ?? this.state.doc.length))
                        this.parse = this.startParse();
                    else
                        return false;
                }
                if (Date.now() > endTime) return false;
            }
        })
    }

    /// @internal
    takeTree() {
        let pos, blocked:boolean, tree: TabTree | undefined;
        if (this.parse && (pos = this.parse.parsedPos) >= this.treeLen) {
            if (this.parse.stoppedAt == null || this.parse.stoppedAt > pos) this.parse.stopAt(pos);
            this.withContext(() => { while (!(tree = this.parse!.advance(Work.MinSlice).tree)) {} });
            this.treeLen = pos;
            this.tree = tree!;
            //this.fragments = this.withoutTempSkipped(ASTFragment.addTree(this.tree, this.fragments, true)); also consider incorporating this.fragments = this.parse.getFragments()
            this.parse = null;
        }
    }

    private withContext<T>(f: () => T): T {
        let prev = currentContext;
        currentContext = this;
        try { return f(); }
        finally { currentContext = prev; }
    }

    private withoutTempSkipped(fragments: readonly TabFragment[]) {
        for (let r; r = this.tempSkipped.pop();) {
            fragments = cutFragments(fragments, r.from, r.to);
        }
        return fragments;
    }

    /// @internal
    changes(changes: ChangeDesc, newState: EditorState) {
        let {fragments, tree, treeLen, viewport, skipped} = this;
        this.takeTree();
        if (!changes.empty) {
            let ranges: ChangedRange[] = [];
            changes.iterChangedRanges((fromA, toA, fromB, toB) => ranges.push({fromA, toA, fromB, toB}));
            // TODO: understand the below code and implement it.
            fragments = TabFragment.applyChanges(fragments, ranges);
            tree = TabTree.empty;
            treeLen = 0;

            //update viewport and the skipped positions according to the changes that are made
            viewport = {from: changes.mapPos(viewport.from, -1), to: changes.mapPos(viewport.to, 1)};
            if (this.skipped.length) {
                skipped = [];
                for (let r of this.skipped) {
                    let from = changes.mapPos(r.from, 1);
                    let to = changes.mapPos(r.to, -1);
                    if (from < to) skipped.push({from, to});
                }
            }
        }
        return new ParseContext(this.parser, newState, fragments, tree, treeLen, viewport, skipped, this.scheduleOn);
    }

    /// @internal
    updateViewport(viewport: {from: number, to: number}) {
        if (this.viewport.from == viewport.from && this.viewport.to == viewport.to) return false;
        this.viewport = viewport;
        let startLen = this.skipped.length;
        for (let i = 0; i < this.skipped.length; i++) {
            let {from, to} = this.skipped[i];
            if (from < viewport.to && to > viewport.from) {
                this.fragments = cutFragments(this.fragments, from, to); // TODO:
                this.skipped.splice(i--, 1);
            }
        }
        if (this.skipped.length >= startLen) return false;
        this.reset();
        return true;
    }

    /// @internal
    reset() {
        if (this.parse) {
            this.takeTree();
            this.parse = null;
        }
    }

    /// Notify hte parse scheduler that the given region was skipped
    /// because it wasn't in view, and the parse should be restarted
    /// when it comes into view.
    skipUntilInView(from: number, to: number) {
        this.skipped.push({from, to});
    }

    static getSkippingParser(until?: Promise<unknown>) {
        return new class extends TabParser {
            createParse(editorState: EditorState, fragments: readonly TabFragment[], ranges: readonly { from: number; to: number; }[]): PartialTabParse {
                let from = ranges[0].from, to = ranges[ranges.length - 1].to;
                let parser = {
                    parsedPos: from,
                    advance(catchupTimeout:number = 0) {
                        let cx = currentContext;
                        if (cx) {
                            for (let r of ranges) cx.tempSkipped.push(r);
                            if (until) cx.scheduleOn = cx.scheduleOn ? Promise.all([cx.scheduleOn, until]) : until;
                        }
                        this.parsedPos = to;
                        // TODO: return new TabTree(length=to-from);
                        return {blocked: false, tree: new TabTree()};
                    },
                    stoppedAt: null,
                    stopAt() {},
                    getFragments() { return [] }
                }
                return parser;
            }
        }
    }

    /// @internal
    isDone(upto: number) {
        upto = Math.min(upto, this.state.doc.length);
        let frags = this.fragments;
        return this.treeLen >= upto && frags.length && frags[0].from == 0 && frags[0].to >= upto;
    }

    /// Get the context for the current parse, or `null` if no editor
    /// parse is in progress
    static get() { return currentContext }
}

function cutFragments(fragments: readonly TabFragment[], from: number, to: number) {
    return TabFragment.applyChanges(fragments, [{fromA: from, toA: to, fromB: from, toB: to}]);
}


class ASTState {
    // The current tree. Immutable, because directly accessible from
    // the editor state.
    readonly tree: TabTree;

    constructor(
        // A mutable parse state that is used to preserve work done during
        // the lifetime of a state when moving to the next state.
        readonly context: ParseContext
    ) {
        this.tree = context.tree;
    }

    apply(tr: Transaction) {
        if (!tr.docChanged) return this;
        let newCx = this.context.changes(tr.changes, tr.state);
        // If the previous parse wasn't done, go forward only up to its
        // end position or the end of the viewport, to avoid slowing down
        // state updates with parse work beyond the viewport.

        //TODO spend some time to understand this correctly. this is where most of your customization would begin.
        let upto = this.context.treeLen == tr.startState.doc.length ? undefined
            : Math.max(tr.changes.mapPos(this.context.treeLen), newCx.viewport.to);
        if (!newCx.work(Work.Apply, upto)) newC

    }

    static init(state: EditorState) {
        let vpTo = Math.min(Work.InitViewport, state.doc.length);
        //TODO understand and then implement this part of the code.
    }
}

TabAST.state = StateField.define<ASTState>({
    create: ASTState.init,
    update(value, tr) {
        for (let e of tr.effects) if (e.is(TabAST.setState)) return e.value; //look at the ParseWorker.work() method to see when we dispatch a setState StateEffect.
        if (tr.startState.facet(tablatureAST) != tr.state.facet(tablatureAST)) return ASTState.init(tr.state);
        return value.apply(tr); 
    }
});

//requestIdleCallback is expimental. if it is available on this device, use it to 
//schedule work when the user is idle to increase percieved responsiveness. 
//otherwise, schedule work normally
let requestIdle;
if (typeof requestIdleCallback != "undefined") {
    requestIdle = (callback: (deadline?:IdleDeadline) => void) => {
        let idle = -1;
        let timeout = setTimeout(() => {
            idle = requestIdleCallback(callback, {timeout: Work.MaxPause - Work.MinPause});
        }, Work.MinPause)
        return () => idle < 0 ? clearTimeout(timeout) : cancelIdleCallback(idle);
    }
} else {
    requestIdle = (callback: (deadline?: IdleDeadline) => void) => {
        let timeout = setTimeout(() => callback(), Work.MaxPause);
        return () => clearTimeout(timeout);
    }
}

const parseWorker = ViewPlugin.fromClass(class ParseWorker {
    //cancels current scheduled work via clearTimeout() or similar
    working: (() => void) | null = null;
    workScheduled = 0;
    // End of the current time chunk
    chunkEnd = -1
    // Milliseconds of budget left for this chunk
    chunkBudget = -1

    constructor(readonly view:EditorView) {
        this.work = this.work.bind(this);
        this.scheduleWork();
    }

    update(update: ViewUpdate) {
        let cx = this.view.state.field(TabAST.state).context;
        if (cx.updateViewport(update.view.viewport) || this.view.viewport.to > cx.treeLen)
            this.scheduleWork();
        if (update.docChanged) {
            if (this.view.hasFocus) this.chunkBudget += Work.ChangeBonus
            this.scheduleWork();
        }
        this.checkAsyncSchedule(cx)
    }

    scheduleWork() {
        if (this.working) return;
        let {state} = this.view, field = state.field(TabAST.state);
        if (field.tree!=field.context.tree || !field.context.isDone(state.doc.length))
            this.working = requestIdle(this.work);
    }

    work(deadline?:IdleDeadline) {
        this.working = null;

        let now = Date.now();
        if (this.chunkEnd < now && (this.chunkEnd < 0 || this.view.hasFocus)) { // Start a new chunk
            this.chunkEnd = now + Work.ChunkTime;
            this.chunkBudget = Work.ChunkBudget;
        }
        if (this.chunkBudget <= 0) return; //no more budget

        let {state, viewport: {to: vpTo}} = this.view;
        let field = state.field(TabAST.state);
        let time = Math.min(this.chunkBudget, Work.Slice, deadline ? Math.max(Work.MinSlice, deadline.timeRemaining() - 5) : 1e9);
        let viewportFirst = field.context.treeLen < vpTo && state.doc.length > vpTo + 1000;   //TODO i don't fully understand this line
        let done = field.context.work(time, vpTo + (viewportFirst ? 0 : Work.MaxParseAhead)); //i also don't fully understand this.
        this.chunkBudget -= Date.now() - now;
        if (done || this.chunkBudget <= 0) {
            field.context.takeTree();
            this.view.dispatch({effects: TabAST.setState.of(new ASTState(field.context))});
        }
        if (this.chunkBudget > 0 && !(done && !viewportFirst)) this.scheduleWork();
        this.checkAsyncSchedule(field.context);
    }

    checkAsyncSchedule(cx: ParseContext) {
        if (cx.scheduleOn) {
            this.workScheduled++;
            cx.scheduleOn
                .then(() => this.scheduleWork())
                .catch(err => logException(this.view.state, err))
                .then(() => this.workScheduled--);
                cx.scheduleOn = null;
        }
    }

    destroy() {
        if (this.working) this.working();
    }

    isWorking() {
        return this.working || this.workScheduled > 0;
    }
}, {
    eventHandlers: {focus() { this.scheduleWork() }}
})

export const tablatureAST = Facet.define<AST, AST|null>({
    combine(astrees) { return astrees.length ? astrees[0] : null },
    enables: [TabAST.state, parseWorker]
});