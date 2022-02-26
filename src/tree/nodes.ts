import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import { SyntaxNodeTypes, TabFragment } from "./ast";

export abstract class ASTNode {
    constructor(
        readonly ranges: Uint16Array,
        /// mapping of SyntaxNode type => syntax nodes where the syntax nodes are the source
        /// nodes of the parse tree from which the ASTNode is being built.
        /// currently, once i lazily parse only once, i dispose of sourceNodes (set to null) for efficiency(TODO: i might remove this feature as it might not be a good idea to dispose)
        protected sourceNodes: {[type:string]:SyntaxNode[]}
        ) {}
        protected parsed = false;
        get isParsed() { return this.parsed }
    abstract parse(offset: number): ASTNode[];
    
    protected disposeSourceNodes() {
        this.sourceNodes = null;
    }
    
    // the length an ASTNode and all its children take up in their source array
    private length = 1;
    public increateLength(children: ASTNode[]) { this.length += children.length }
}


export class TabSegment extends ASTNode {
    parse(offset: number): TabBlock[] {
        if (this.parsed) return [];
        this.parsed = true;
        
        let modifiers = this.sourceNodes[SyntaxNodeTypes.TabSegment][0].getChildren(SyntaxNodeTypes.Modifier);

        let strings:SyntaxNode[][] = [];
        for (let line of this.sourceNodes[SyntaxNodeTypes.TabSegment][0].getChildren(SyntaxNodeTypes.TabSegmentLine)) {
            strings.push(line.getChildren(SyntaxNodeTypes.TabString).reverse()); //reversed for efficiency in performing remove operations
        }

        let blockAnchors:SyntaxNode[] = [];
        let blocks:SyntaxNode[][] //each array of syntax node is a block

        let string:SyntaxNode, stringLine:SyntaxNode[], bI: number, isStringPlaced:boolean, anchor:SyntaxNode; // variables used in inner loops, but defined outside loop for efficiency
        let firstUncompletedBlockIdx = 0;
        let hasGroupedAllStrings: boolean;
        do {
            hasGroupedAllStrings = true;

            for (stringLine of strings) {
                hasGroupedAllStrings = hasGroupedAllStrings && stringLine.length==0;
                if (stringLine.length==0) continue;
                
                string = stringLine.pop();
                isStringPlaced = false;
                for (bI=firstUncompletedBlockIdx; bI<blockAnchors.length; bI++) {
                    anchor = blockAnchors[bI];
                    if (anchor.to <= string.from) continue;
                    if (string.to <= anchor.from) {
                        // it doesn't overlap with any existing blocks
                        if (bI==0) {
                            blocks.unshift([string]);; //create a new block
                            blockAnchors.unshift(string); //set this as the block's anchor
                        } else {
                            blocks.splice(bI, 0, [string]);
                            blockAnchors.splice(bI, 0, string);
                        }
                        isStringPlaced = true;
                        break;
                    }
                    // at this point, `string` definitely overlaps with `anchor`
                    blocks[bI].push(string);
                    if (string.from < anchor.from) blockAnchors[bI] = string; // change this block's anchor
                }
                if (!isStringPlaced) {
                    //string doesn't belong to any existing blocks. create new block that comes after all the existing ones.
                    blocks.push([string]);
                    blockAnchors.push(string);
                    continue;
                }
            }
            // at this point, a block has definitely been grouped
            firstUncompletedBlockIdx += 1;
        } while (!hasGroupedAllStrings);

        // now we have all the blocks and their anchor nodes. now we use those anchor nodes to know what modifiers belong to what block
        let blockModifiers:SyntaxNode[][] = [];
        bI = 0;
        for (let modifier of modifiers) {
            anchor = blockAnchors[bI];
            while (anchor && anchor.to <= modifier.from) {
                anchor = blockAnchors[++bI];
            }
            if (!anchor || anchor.from >= modifier.to) {
                // if this modifier belongs to no block, add it to the nearest block on its left (and if none, the nearest on its right)
                let idx = bI==0 ? 0 : bI-1;
                if (!blockModifiers[idx]) blockModifiers[idx] = [];
                blockModifiers[idx].push(modifier);
                continue;
            }
            blockModifiers[bI].push(modifier);
        }

        let tabBlocks:TabBlock[] = [];
        for (bI=0; bI<blocks.length; bI++) {
            let ranges:number[] = []; // remember, ranges are relative to its parent fragment
            for (let block of blocks[bI]) {
                ranges.push(block.from-offset);
                ranges.push(block.to-offset);
            }
            for (let bModifier of blockModifiers[bI]) {
                ranges.push(bModifier.from-offset);
                ranges.push(bModifier.to-offset);
            }
            tabBlocks.push(new TabBlock(Uint16Array.from(ranges), {
                [SyntaxNodeTypes.Modifier]: blockModifiers[bI],
                [SyntaxNodeTypes.TabString]: blocks[bI]
            }));
        }
        
        this.disposeSourceNodes();
        return tabBlocks;
    }
}

export class TabBlock extends ASTNode {
    parse(offset: number) {
        if (this.parsed) return [];
        this.parsed = true;
        //include modifiers and measures as children
        
        this.disposeSourceNodes();
        return []
    }
}

export class Measure extends ASTNode {
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