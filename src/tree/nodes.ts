import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import { SyntaxNodeTypes } from "./ast";

export abstract class ASTNode {
    constructor(
        readonly ranges: Uint16Array,
        readonly childrenCount: number,
        private readonly editorState: EditorState,
        /// the source nodes of the parse tree from which this ASTNode is being built.
        /// this is only used once to lazily parse the children ASTNodes of this ASTNode and 
        /// then it is disposed for memory/storage efficiency
        /// if null, the source nodes are retrieved from the editorState
        protected sourceNodes: SyntaxNode[] | null = null
    ) {
    }
    abstract getType(): string;
    /// This gets the SyntaxNode type that directly corrolate to this ast node and checks if it equals nodeName  (e.g. the Measure ast node directly corrolates to the Measure SyntaxNode type and TabBlock directly corrolates to multiple TabString SyntaxNodes)
    protected abstract isSyntaxAnchor(nodeName: string): boolean;
    abstract parse(): ASTNode[];

    protected ensureSourceNodesPresent() {
        if (this.sourceNodes) return;
        this.sourceNodes = []
        for (let i = 0; i < this.ranges.length; i += 2) {
            let rawParseTree = syntaxTree(this.editorState);
            let curr = (rawParseTree.resolve(this.ranges[i],1) as SyntaxNode).cursor;
            while(!this.isSyntaxAnchor(curr.name) && curr.parent()) {}
            if (!this.isSyntaxAnchor(curr.name)) this.sourceNodes.push(curr.node);
        }
    }
    protected disposeSourceNodes() {
        this.sourceNodes = null;
    }
}


export class TabSegment extends ASTNode {
    getType() { return TabSegment.name }
    protected isSyntaxAnchor(nodeName: string) { return nodeName==SyntaxNodeTypes.TabSegment }
    parse() {
        this.ensureSourceNodesPresent();
        // remember to also break up all the modifiers into the TabBlock which they fall into. modifiers that overflow from a TabBlock belong to the first TabBlock which it overlaps (i.e. it belongs to the TabBlock into which its starting index falls)

        this.disposeSourceNodes();
    }
}

export class TabBlock extends ASTNode {
    getType() { return TabBlock.name; }
    protected isSyntaxAnchor(nodeName:string) { return nodeName in [SyntaxNodeTypes.TabString, SyntaxNodeTypes.Repeat, SyntaxNodeTypes.TimeSignature, SyntaxNodeTypes.Multiplier] }
    parse() {
        this.ensureSourceNodesPresent();
        
        let nodes: Measure[]

        this.disposeSourceNodes();
    }
}

export class Measure extends ASTNode {
    getType() { return Measure.name; }
}

export function findSyntaxNodeAt(start: number, type: SyntaxNodeTypes) {

}

// TODO: idea: for stuff like tracking state when traversing the abstract syntax tree for stuff like converting to xml or linting
// xml or linting, we can do something similar to what eslint does like this: have multiple StateUnits that keep track of individual pieces of state.
// so for tracking time signatures which are abovefor example, we can have something like the following StateUnit:
// {
//      docs: {
//          id: "TimeSignatureState"
//      }
//      "TimeSig:enter" = (context) => {
//          //you can get the current state by doing something like:
//          context.getStateUnit(this.doc.id)
//          registerStateChange<state unit type>(this.doc.id, (state) => {
//              //state is the actual piece of the whole state we have
//              let newState.timeSigHistory = [state.timeSigHistory..., EditorState.textAt(context.treeCursor.node.from, context.treeCursor.node.to).parseOutTimeSignature()];
//              return newState;
//
//          })
//      }
//      "TabBlock:exit" = (context) => {
//          //go back to default time signature after this TabBlock (that is the feature we want to implement for this state unit)
//          registerStateChange<type>(this.doc.id, (state) => [defaultTimeSigState])
//      }
// }

// we can also have a StateUnit that keeps track of the current linenames: when it enters a TabBlock, it gets its measure line names 
// from its first measure (if it has line names) or it gets a certain default tuning and sets it as the state and when we enter a different
// TabBlock, the line names change