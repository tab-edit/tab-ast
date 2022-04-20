//TODO: give credit to https://github.com/codemirror/language/blob/main/src/language.ts
import { ChangeDesc, EditorState, Extension, Facet, StateEffect, StateField, Transaction } from "@codemirror/state";
import { EditorView, logException, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { ChangedRange } from "@lezer/common";
import { TabParser, PartialTabParse } from "./parsers/fragment_level_parser";
import { TabFragment, TabTree } from "./tree/tab_fragment";
export { TabParserImplement } from "./parsers/fragment_level_parser";

export function defineTabLanguageFacet(baseData?: {[name: string]: any}) {
    return Facet.define<{[name: string]: any}>({
        combine: baseData ? values => values.concat(baseData!) : undefined
    });
}

// nightmare to debug. i wanna cry

// This mirrors the `Language` class in @codemirror/language
export class TabLanguage {
    /// The extension value to install this provider.
    readonly extension: Extension;

    /// The parser object.
    parser: TabParser;
    
    ///
    constructor(
        /// The tablature data data facet used for this language (TODO: i don't understand this)
        readonly data: Facet<{[name: string]: any}>,
        parser: TabParser,
        extraExtensions: Extension[] = []
    ) {
        // kludge to define EditorState.tree as a debugging helper,
        // without the EditorState package actually knowing about it
        if (!EditorState.prototype.hasOwnProperty("tree")) {
            Object.defineProperty(EditorState.prototype, "tree", {get() { return tabSyntaxTree(this) }});
        }
        
        this.parser = parser;
        this.extension = [
            tabLanguage.of(this),
            EditorState.languageData.of((state, pos, side) => state.facet(tabLanguageDataFacetAt(state, pos, side)!))
        ].concat(extraExtensions);
    }

    /// Query whether this language is active at the given position
    isActiveAt(state: EditorState, pos: number, side: -1 | 0 | 1 = -1) {
        return tabLanguageDataFacetAt(state, pos, side) === this.data;
    }

    /// Indicates whether this language allows nested languages. The 
    /// default implementation returns true.
    get allowsNesting() { return false }

    static define(spec: {
        parser: TabParser,
        languageData?: {[name: string]: any}
    }) {
        // TODO: revisit this to make sure that this modification is correct
        let data = defineTabLanguageFacet(spec.languageData);
        return new TabLanguage(data, spec.parser);
    }

    /// @internal
    static state: StateField<TabLanguageState>;

    ///@internal
    static setState = StateEffect.define<TabLanguageState>();
}

export function tabLanguageDataFacetAt(state: EditorState, pos: number, side: -1 | 0 | 1) {
    let topLang = state.facet(tabLanguage);
    if (!topLang) return null;
    let facet = topLang.data;
    return facet;
}

/// Get the syntax tree for a state, which is the current (possibly
/// incomplete) parse tree of active language, or the empty tree 
/// if there is no language available.
export function tabSyntaxTree(state: EditorState): TabTree {
    let field = state.field(TabLanguage.state, false)
    return field ? field.tree : TabTree.empty
  }

/// Try to get a parse tree that spans at least up to `upto`. The
/// method will do at most `timeout` milliseconds of work to parse
/// up to that point if the tree isn't already available.
export function ensureTabSyntaxTree(state: EditorState, upto: number, timeout = 50): TabTree | null {
    let parse = state.field(TabLanguage.state, false)?.context;
    return !parse ? null : parse.isDone(upto) || parse.work(timeout, upto) ? parse.tree : null;
}

/// Queries whether there is a full syntax tree available up to the 
/// given document position. If there isn't, the background parse
/// process _might_ still be working and update the tree further, but 
/// there is no guarantee of that-the parser will stop working when it 
/// has spent a certain amount of time or has moved beyond the visible
/// viewport. Always returns false if no language has been enabled.
export function tabSyntaxTreeAvailable(state: EditorState, upto = state.doc.length) {
    return state.field(TabLanguage.state, false)?.context.isDone(upto) || false;
}

/// Tells you whether the language parser is planning to do more
/// parsing work (in a `requestIdleCallback` pseudo-thread) or has
/// stopped running, either because it parsed the entire document,
/// because it spent too much time and was cut off, or because there
/// is no language parser enabled.
export function tabSyntaxParserRunning(view: EditorView) {
    return view.plugin(parseWorker)?.isWorking() || false;
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
export class ParseContext  {
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
        if (this.tree !== TabTree.empty && this.isDone(upto ?? this.state.doc.length)) {
            this.takeTree();
            return true;
        }
        return this.withContext(() => {
            let endTime = Date.now() + time;
            if (!this.parse) this.parse = this.startParse();
            if (upto != null && (this.parse.stoppedAt === null || this.parse.stoppedAt > upto) &&
                upto < this.state.doc.length) this.parse.stopAt(upto);
            for(;;) {
                let {tree} = this.parse.advance();
                if (tree!==null) {
                    this.fragments = this.withoutTempSkipped(TabFragment.addTree(tree, this.fragments));
                    this.treeLen = this.parse.stoppedAt ?? this.state.doc.length;
                    this.tree = tree;
                    this.parse = null;
                    // TODO: for some reason, this.parse.stoppedAt is always null when we reach the end of an incompltete tree
                    // and this prevents us from starting another parse
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
        let pos, tree: TabTree | null | undefined;
        if (this.parse && (pos = this.parse.parsedPos) >= this.treeLen) {
            if (this.parse.stoppedAt === null || this.parse.stoppedAt > pos) this.parse.stopAt(pos);
            this.withContext(() => { while (!(tree = this.parse!.advance(Work.MinSlice).tree)) {} });
            this.treeLen = pos;
            this.tree = tree!;
            this.fragments = this.withoutTempSkipped(TabFragment.addTree(this.tree, this.fragments));
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
        if (this.viewport.from === viewport.from && this.viewport.to === viewport.to) return false;
        this.viewport = viewport;
        let startLen = this.skipped.length;
        for (let i = 0; i < this.skipped.length; i++) {
            let {from, to} = this.skipped[i];
            if (from < viewport.to && to > viewport.from) {
                this.fragments = cutFragments(this.fragments, from, to); // TODO: understand this
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

    /// Notify the parse scheduler that the given region was skipped
    /// because it wasn't in view, and the parse should be restarted
    /// when it comes into view.
    skipUntilInView(from: number, to: number) {
        this.skipped.push({from, to});
    }

    /// Returns a parser intended to be used as placeholder when
    /// asynchronously loading a nested parser. It'll skip its input and
    /// mark it as not-really-parsed, so that the next update will parse
    /// it again.
    ///
    /// When `until` is given, a reparse will be scheduled when that
    /// promise resolves.
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
                        return {blocked: false, tree: TabTree.createBlankTree(from, to)};
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
        return this.treeLen >= upto && frags.length && frags[0].from === 0 && frags[frags.length-1].to >= upto;
    }

    /// Get the context for the current parse, or `null` if no editor
    /// parse is in progress
    static get() { return currentContext }
}

function cutFragments(fragments: readonly TabFragment[], from: number, to: number) {
    return TabFragment.applyChanges(fragments, [{fromA: from, toA: to, fromB: from, toB: to}]);
}


class TabLanguageState {
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

        //TODO spend some time to understand this correctly.
        let upto = this.context.treeLen === tr.startState.doc.length ? undefined
            : Math.max(tr.changes.mapPos(this.context.treeLen), newCx.viewport.to);
        if (!newCx.work(Work.Apply, upto)) newCx.takeTree();
        return new TabLanguageState(newCx);
    }

    static init(state: EditorState) {
        let vpTo = Math.min(Work.InitViewport, state.doc.length);
        let parseState = new ParseContext(state.facet(tabLanguage)!.parser, state, [],
                                            TabTree.empty, 0, {from: 0, to: vpTo}, [], null);
        if (!parseState.work(Work.Apply, vpTo)) parseState.takeTree(); // TODO: understand this line
        return new TabLanguageState(parseState);
    }
}

TabLanguage.state = StateField.define<TabLanguageState>({
    create: TabLanguageState.init,
    update(value, tr) {
        for (let e of tr.effects) if (e.is(TabLanguage.setState)) return e.value; //look at the ParseWorker.work() method to see when we dispatch a setState StateEffect.
        if (tr.startState.facet(tabLanguage) !== tr.state.facet(tabLanguage)) return TabLanguageState.init(tr.state);
        return value.apply(tr); 
    }
});

//requestIdleCallback is expimental. if it is available on this device, use it to 
//schedule work when the user is idle to increase percieved responsiveness. 
//otherwise, schedule work normally
let requestIdle:any;
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
        let cx = this.view.state.field(TabLanguage.state).context;
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
        let {state} = this.view, field = state.field(TabLanguage.state);
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
        let field = state.field(TabLanguage.state);
        let time = Math.min(this.chunkBudget, Work.Slice, deadline ? Math.max(Work.MinSlice, deadline.timeRemaining() - 5) : 1e9);
        let viewportFirst = field.context.treeLen < vpTo && state.doc.length > vpTo + 1000;   //TODO i don't fully understand this line
        let done = field.context.work(time, vpTo + (viewportFirst ? 0 : Work.MaxParseAhead)); //i also don't fully understand this.
        this.chunkBudget -= Date.now() - now;
        if (done || this.chunkBudget <= 0) {
            field.context.takeTree();
            this.view.dispatch({effects: TabLanguage.setState.of(new TabLanguageState(field.context))});
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

// This mirrors the `language` facet in @codemirror/language
export const tabLanguage = Facet.define<TabLanguage, TabLanguage|null>({
    combine(tabLanguages) { return tabLanguages.length ? tabLanguages[0] : null },
    enables: [TabLanguage.state, parseWorker]
});


/// This class bundles a TabLanguage object with an 
/// optional set of supporting extensions. TabLanguage packages are 
/// encouraged to export a function that optionally takes a 
/// configuration object and returns a `TabLanguageSupport` instance, as 
/// the main way for client code to use the package
export class TabLanguageSupport {
    /// An extension including both the language and its support 
    /// extensions. (Allowing the object to be used as an extension 
    /// value itself.)
    extension: Extension;

    /// Create a support object
    constructor(
        /// The language object.
        readonly tabLanguage: TabLanguage,
        /// An optional set of supporting extensions.
        readonly support: Extension = []
    ) {
        this.extension = [tabLanguage, support];
    }
}

export { TabTree } from './tree/tab_fragment';
export { ASTCursor, FragmentCursor, Cursor } from './tree/cursors';
export { ASTNode } from './tree/nodes';