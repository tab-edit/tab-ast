//TODO give credit to https://github.com/codemirror/language/blob/main/src/language.ts
import { EditorState, Facet, StateEffect, StateField, Transaction } from "@codemirror/state";
import { EditorView, logException, ViewPlugin, ViewUpdate } from "@codemirror/view";

class TabAST {
    // TODO

    /// @internal
    static state: StateField<ASTState>;

    ///@internal
    static setState = StateEffect.define<ASTState>();
}

class ParseContext {
    constructor(
        /// The current editor state.
        readonly state: EditorState,
        public tree: TreeWalker,
        public 
    ) {}
    // TODO
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

class ASTState {
    // The current tree. Immutable, because directly accessible from
    // the editor state.
    readonly tree: AST;

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