"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tablatureAST = void 0;
//TODO give credit to https://github.com/codemirror/language/blob/main/src/language.ts
const state_1 = require("@codemirror/state");
const view_1 = require("@codemirror/view");
const parse_utils_1 = require("./parse-utils");
class TabAST {
}
///@internal
TabAST.setState = state_1.StateEffect.define();
let currentContext = null;
/// A parse context provided to parsers working on the editor content.
class ParseContext {
    /// @internal
    constructor(
    /// The current editor state.
    state, 
    /// @internal
    tree, treeLen, 
    /// The current editor viewport (or some overapproximation
    /// thereof). Intended to be used for opportunistically avoiding
    /// work (in which case
    /// [`skipUntilInView`](#language.ParseContext.skipUntilInView)
    /// should be called to make sure the parser is restarted when the
    /// skipped region becomes visible).
    viewport, 
    /// @internal
    skipped, 
    /// This is where skipping parsers can register a promise that,
    /// when resolved, will schedule a new parse. It is cleared when
    /// the parse worker picks up the promise. @internal
    scheduleOn) {
        this.state = state;
        this.tree = tree;
        this.treeLen = treeLen;
        this.viewport = viewport;
        this.skipped = skipped;
        this.scheduleOn = scheduleOn;
        this.parse = null;
    }
    // TODO
    /// @internal
    takeTree() {
        let pos, tree;
        if (this.parse && (pos = this.parse.parsedPos) >= this.treeLen) {
            if (this.parse.stoppedAt == null || this.parse.stoppedAt > pos)
                this.parse.stopAt(pos);
            this.withContext(() => { while (!(tree = this.parse.advance())) { } });
            this.treeLen = pos;
            this.tree = tree;
            // TODO understand this line and implement it
            //this.fragments = this.withoutTempSkipped(ASTFragment.addTree(this.tree, this.fragments, true));
            this.parse = null;
        }
    }
    withContext(f) {
        let prev = currentContext;
        currentContext = this;
        try {
            return f();
        }
        finally {
            currentContext = prev;
        }
    }
    /// @internal
    changes(changes, newState) {
        let { fragments, tree, treeLen, viewport, skipped } = this;
        this.takeTree();
        if (!changes.empty) {
            let ranges = [];
            changes.iterChangedRanges((fromA, toA, fromB, toB) => ranges.push({ fromA, toA, fromB, toB }));
            //update tree fragments based on the changes
            fragments = parse_utils_1.ASTFragment.applyChanges(fragments, ranges);
            tree = parse_utils_1.AST.empty;
            treeLen = 0;
            //update viewport and the skipped positions according to the changes that are made
            viewport = { from: changes.mapPos(viewport.from, -1), to: changes.mapPos(viewport.to, 1) };
            if (this.skipped.length) {
                skipped = [];
                for (let r of this.skipped) {
                    let from = changes.mapPos(r.from, 1);
                    let to = changes.mapPos(r.to, -1);
                    if (from < to)
                        skipped.push({ from, to });
                }
            }
        }
        //return new ParseContext()
    }
}
class ASTState {
    constructor(
    // A mutable parse state that is used to preserve work done during
    // the lifetime of a state when moving to the next state.
    context) {
        this.context = context;
        this.tree = context.tree;
    }
    apply(tr) {
        if (!tr.docChanged)
            return this;
        let newCx = this.context.changes(tr.changes, tr.state);
        // If the previous parse wasn't done, go forward only up to its
        // end position or the end of the viewport, to avoid slowing down
        // state updates with parse work beyond the viewport.
        //TODO spend some time to understand this correctly. this is where most of your customization would begin.
        let upto = this.context.treeLen == tr.startState.doc.length ? undefined
            : Math.max(tr.changes.mapPos(this.context.treeLen), newCx.viewport.to);
        if (!newCx.work(20 /* Apply */, upto))
            newC;
    }
    static init(state) {
        let vpTo = Math.min(3000 /* InitViewport */, state.doc.length);
        //TODO understand and then implement this part of the code.
    }
}
TabAST.state = state_1.StateField.define({
    create: ASTState.init,
    update(value, tr) {
        for (let e of tr.effects)
            if (e.is(TabAST.setState))
                return e.value; //look at the ParseWorker.work() method to see when we dispatch a setState StateEffect.
        if (tr.startState.facet(exports.tablatureAST) != tr.state.facet(exports.tablatureAST))
            return ASTState.init(tr.state);
        return value.apply(tr);
    }
});
//requestIdleCallback is expimental. if it is available on this device, use it to 
//schedule work when the user is idle to increase percieved responsiveness. 
//otherwise, schedule work normally
let requestIdle;
if (typeof requestIdleCallback != "undefined") {
    requestIdle = (callback) => {
        let idle = -1;
        let timeout = setTimeout(() => {
            idle = requestIdleCallback(callback, { timeout: 500 /* MaxPause */ - 100 /* MinPause */ });
        }, 100 /* MinPause */);
        return () => idle < 0 ? clearTimeout(timeout) : cancelIdleCallback(idle);
    };
}
else {
    requestIdle = (callback) => {
        let timeout = setTimeout(() => callback(), 500 /* MaxPause */);
        return () => clearTimeout(timeout);
    };
}
const parseWorker = view_1.ViewPlugin.fromClass(class ParseWorker {
    constructor(view) {
        this.view = view;
        //cancels current scheduled work via clearTimeout() or similar
        this.working = null;
        this.workScheduled = 0;
        // End of the current time chunk
        this.chunkEnd = -1;
        // Milliseconds of budget left for this chunk
        this.chunkBudget = -1;
        this.work = this.work.bind(this);
        this.scheduleWork();
    }
    update(update) {
        let cx = this.view.state.field(TabAST.state).context;
        if (cx.updateViewport(update.view.viewport) || this.view.viewport.to > cx.treeLen)
            this.scheduleWork();
        if (update.docChanged) {
            if (this.view.hasFocus)
                this.chunkBudget += 50 /* ChangeBonus */;
            this.scheduleWork();
        }
        this.checkAsyncSchedule(cx);
    }
    scheduleWork() {
        if (this.working)
            return;
        let { state } = this.view, field = state.field(TabAST.state);
        if (field.tree != field.context.tree || !field.context.isDone(state.doc.length))
            this.working = requestIdle(this.work);
    }
    work(deadline) {
        this.working = null;
        let now = Date.now();
        if (this.chunkEnd < now && (this.chunkEnd < 0 || this.view.hasFocus)) { // Start a new chunk
            this.chunkEnd = now + 30000 /* ChunkTime */;
            this.chunkBudget = 3000 /* ChunkBudget */;
        }
        if (this.chunkBudget <= 0)
            return; //no more budget
        let { state, viewport: { to: vpTo } } = this.view;
        let field = state.field(TabAST.state);
        let time = Math.min(this.chunkBudget, 100 /* Slice */, deadline ? Math.max(25 /* MinSlice */, deadline.timeRemaining() - 5) : 1e9);
        let viewportFirst = field.context.treeLen < vpTo && state.doc.length > vpTo + 1000; //TODO i don't fully understand this line
        let done = field.context.work(time, vpTo + (viewportFirst ? 0 : 100000 /* MaxParseAhead */)); //i also don't fully understand this.
        this.chunkBudget -= Date.now() - now;
        if (done || this.chunkBudget <= 0) {
            field.context.takeTree();
            this.view.dispatch({ effects: TabAST.setState.of(new ASTState(field.context)) });
        }
        if (this.chunkBudget > 0 && !(done && !viewportFirst))
            this.scheduleWork();
        this.checkAsyncSchedule(field.context);
    }
    checkAsyncSchedule(cx) {
        if (cx.scheduleOn) {
            this.workScheduled++;
            cx.scheduleOn
                .then(() => this.scheduleWork())
                .catch(err => (0, view_1.logException)(this.view.state, err))
                .then(() => this.workScheduled--);
            cx.scheduleOn = null;
        }
    }
    destroy() {
        if (this.working)
            this.working();
    }
    isWorking() {
        return this.working || this.workScheduled > 0;
    }
}, {
    eventHandlers: { focus() { this.scheduleWork(); } }
});
exports.tablatureAST = state_1.Facet.define({
    combine(astrees) { return astrees.length ? astrees[0] : null; },
    enables: [TabAST.state, parseWorker]
});
//# sourceMappingURL=ast.js.map