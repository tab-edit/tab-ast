import { StateEffect, StateField, Facet, EditorState } from '@codemirror/state';
import { ViewPlugin, logException } from '@codemirror/view';
import { ensureSyntaxTree } from '@codemirror/language';

class FragmentCursor {
    constructor(
    // might want to change this to an array of numbers.
    fragSet, pointer = 0, currentCursor) {
        this.fragSet = fragSet;
        this.pointer = pointer;
        this.currentCursor = currentCursor;
        if (!this.currentCursor)
            this.currentCursor = fragSet[pointer].cursor;
    }
    static from(fragSet, startingPos) {
        if (!fragSet || !fragSet.length)
            return null;
        return new FragmentCursor(fragSet, startingPos || 0);
    }
    get name() { return this.currentCursor.name; }
    get ranges() { return this.currentCursor.ranges; }
    get node() { return this.currentCursor.node; }
    sourceSyntaxNode() { return this.currentCursor.sourceSyntaxNode(); }
    getAncestors() { return this.currentCursor.getAncestors(); }
    firstChild() { return this.currentCursor.firstChild(); }
    lastChild() { return this.currentCursor.lastChild(); }
    parent() { return this.currentCursor.parent(); }
    prevSibling() {
        if (!this.currentCursor.fork().parent() && this.pointer > 0) {
            this.pointer = this.pointer - 1;
            this.currentCursor = this.fragSet[this.pointer].cursor;
            return true;
        }
        return this.currentCursor.prevSibling();
    }
    nextSibling() {
        if (!this.currentCursor.fork().parent() && this.pointer + 1 < this.fragSet.length) {
            this.pointer = this.pointer + 1;
            this.currentCursor = this.fragSet[this.pointer].cursor;
            return true;
        }
        return this.currentCursor.nextSibling();
    }
    fork() { return new FragmentCursor(this.fragSet, this.pointer, this.currentCursor); }
}
class ASTCursor {
    constructor(
    // might want to change this to an array of numbers.
    nodeSet, pointer = 0, ancestryTrace = []) {
        this.nodeSet = nodeSet;
        this.pointer = pointer;
        this.ancestryTrace = ancestryTrace;
    }
    static from(nodeSet) {
        if (!nodeSet || !nodeSet.length)
            return null;
        return new ASTCursor(nodeSet, 0, []);
    }
    get name() { return this.nodeSet[this.pointer].name; }
    get ranges() { return Array.from(this.nodeSet[this.pointer].ranges); }
    get node() { return Object.freeze(this.nodeSet[this.pointer]); }
    sourceSyntaxNode() { var _a; return ((_a = this.nodeSet[this.pointer]) === null || _a === void 0 ? void 0 : _a.getRootNodeTraverser()) || null; }
    getAncestors() {
        return this.ancestryTrace.map(idx => Object.freeze(this.nodeSet[idx]));
    }
    firstChild() {
        if (this.nodeSet.length === 0)
            return false;
        let currentPointer = this.pointer;
        if (this.nodeSet[this.pointer].length === 1)
            return false;
        this.pointer += 1;
        this.ancestryTrace.push(currentPointer);
        return true;
    }
    lastChild() {
        if (!this.firstChild())
            return false;
        while (this.nextSibling()) { }
        return true;
    }
    parent() {
        if (this.nodeSet.length === 0)
            return false;
        if (this.name === TabFragment.name || this.ancestryTrace.length === 0)
            return false;
        this.pointer = this.ancestryTrace[this.ancestryTrace.length - 1];
        this.ancestryTrace.pop();
        return true;
    }
    prevSibling() {
        let currentPointer = this.pointer;
        if (!this.parent())
            return false;
        this.firstChild();
        let prevSiblingPointer = this.pointer;
        if (prevSiblingPointer === currentPointer)
            return false;
        while (this.nextSibling() && this.pointer !== currentPointer) {
            prevSiblingPointer = this.pointer;
        }
        this.pointer = prevSiblingPointer;
        return true;
    }
    nextSibling() {
        if (!this.ancestryTrace.length)
            return false;
        let parentPointer = this.ancestryTrace[this.ancestryTrace.length - 1];
        let nextInorder = this.pointer + this.nodeSet[this.pointer].length;
        if (parentPointer + this.nodeSet[parentPointer].length <= nextInorder)
            return false;
        this.pointer = nextInorder;
        return true;
    }
    fork() {
        return new ASTCursor(this.nodeSet, this.pointer, this.ancestryTrace);
    }
    printTree() {
        let str = this.printTreeRecursiveHelper();
        return str;
    }
    printTreeRecursiveHelper() {
        if (this.nodeSet.length == 0)
            return "";
        let str = `${this.nodeSet[this.pointer].name}`;
        if (this.firstChild())
            str += "(";
        else
            return str;
        let first = true;
        do {
            if (!first)
                str += ",";
            first = false;
            str += this.printTreeRecursiveHelper();
        } while (this.nextSibling());
        str += ")";
        this.parent();
        return str;
    }
}
ASTCursor.dud = new ASTCursor([]);
// Don't know when we will use this, but it is for the user to 
// be able to access and traverse the raw syntax nodes while 
// still maintaining the fact that all nodes' positions are 
// relative to the TabFragment in which they are contained.
class AnchoredSyntaxCursor {
    constructor(startingNode, anchorOffset) {
        this.anchorOffset = anchorOffset;
        this.cursor = startingNode.cursor;
    }
    get type() { return this.cursor.type; }
    get name() { return this.cursor.name; }
    get from() { return this.cursor.from - this.anchorOffset; }
    get to() { return this.cursor.to - this.anchorOffset; }
    get node() { return Object.freeze(new OffsetSyntaxNode(this.cursor.node, this.anchorOffset)); }
    firstChild() { return this.cursor.firstChild(); }
    lastChild() { return this.cursor.lastChild(); }
    enter(pos, side, overlays = true, buffers = true) {
        return this.cursor.enter(pos, side, overlays, buffers);
    }
    parent() {
        if (this.name === TabFragment.AnchorNode)
            return false;
        return this.cursor.parent();
    }
    nextSibling() {
        if (this.name === TabFragment.AnchorNode)
            return false;
        return this.cursor.nextSibling();
    }
    prevSibling() {
        if (this.name === TabFragment.AnchorNode)
            return false;
        return this.cursor.nextSibling();
    }
    fork() {
        return new AnchoredSyntaxCursor(this.cursor.node, this.anchorOffset);
    }
}
class OffsetSyntaxNode {
    constructor(node, offset) {
        this.node = node;
        this.offset = offset;
    }
    get type() { return this.node.type; }
    get name() { return this.node.name; }
    get from() { return this.node.from - this.offset; }
    get to() { return this.node.to - this.offset; }
}

var SyntaxNodeTypes;
(function (SyntaxNodeTypes) {
    SyntaxNodeTypes["Tablature"] = "Tablature";
    SyntaxNodeTypes["TabSegment"] = "TabSegment";
    SyntaxNodeTypes["TabSegmentLine"] = "TabSegmentLine";
    SyntaxNodeTypes["TabString"] = "TabString";
    SyntaxNodeTypes["MeasureLineName"] = "MeasureLineName";
    SyntaxNodeTypes["MeasureLine"] = "MeasureLine";
    SyntaxNodeTypes["Note"] = "Note";
    SyntaxNodeTypes["NoteDecorator"] = "NoteDecorator";
    SyntaxNodeTypes["NoteConnector"] = "NoteConnector";
    SyntaxNodeTypes["ConnectorSymbol"] = "ConnectorSymbol";
    SyntaxNodeTypes["Hammer"] = "Hammer";
    SyntaxNodeTypes["Pull"] = "Pull";
    SyntaxNodeTypes["Slide"] = "Slide";
    SyntaxNodeTypes["Fret"] = "Fret";
    SyntaxNodeTypes["Harmonic"] = "Harmonic";
    SyntaxNodeTypes["Grace"] = "Frace";
    SyntaxNodeTypes["Comment"] = "Comment";
    SyntaxNodeTypes["RepeatLine"] = "RepeatLine";
    SyntaxNodeTypes["Repeat"] = "Repeat";
    SyntaxNodeTypes["Multiplier"] = "Multiplier";
    SyntaxNodeTypes["TimeSignature"] = "TimeSignature";
    SyntaxNodeTypes["TimeSigLine"] = "TimeSigLine";
    SyntaxNodeTypes["TimingLine"] = "TimingLine";
    SyntaxNodeTypes["Modifier"] = "Modifier";
    SyntaxNodeTypes["InvalidToken"] = "\u26A0";
})(SyntaxNodeTypes || (SyntaxNodeTypes = {}));
class ASTNode {
    constructor(
    /// mapping of SyntaxNode type => syntax nodes where the syntax nodes are the source
    /// nodes of the parse tree from which the ASTNode is being built.
    /// currently, once i lazily parse only once, i dispose of sourceNodes (set to null) for efficiency(TODO: i might remove this feature as it might not be a good idea to dispose)
    sourceNodes, offset) {
        this.sourceNodes = sourceNodes;
        this.offset = offset;
        // parse up-keep
        this.parsed = false;
        // the length an ASTNode and all its children take up in their source array
        this._length = 1;
        this.ranges = Uint16Array.from(this.computeRanges(sourceNodes, offset));
    }
    get isSingleSpanNode() { return typeof this.getRootNodeTraverser === "function"; }
    get name() { return this.constructor.name; }
    get isParsed() { return this.parsed; }
    parse(sourceText) {
        if (this.parsed)
            return [];
        this.parsed = true;
        return this.createChildren(sourceText);
    }
    disposeSourceNodes() {
        // TODO: consider if we should preserve sourceNodes
        this.sourceNodes = {};
    }
    increaseLength(children) { this._length += children.length; }
    get length() { return this._length; }
    computeRanges(sourceNodes, offset) {
        let rngs = [];
        for (let name in sourceNodes) {
            for (let node of sourceNodes[name]) {
                rngs.push(node.from - offset);
                rngs.push(node.to - offset);
            }
        }
        return rngs;
    }
}
class TabSegment extends ASTNode {
    getRootNodeTraverser() {
        return new AnchoredSyntaxCursor(this.sourceNodes[SyntaxNodeTypes.TabSegment][0], this.offset);
    }
    createChildren(sourceText) {
        let modifiers = this.sourceNodes[SyntaxNodeTypes.TabSegment][0].getChildren(SyntaxNodeTypes.Modifier);
        let strings = [];
        for (let line of this.sourceNodes[SyntaxNodeTypes.TabSegment][0].getChildren(SyntaxNodeTypes.TabSegmentLine)) {
            strings.push(line.getChildren(SyntaxNodeTypes.TabString).reverse()); //reversed for efficiency in performing remove operations
        }
        let blocks = []; //each array of syntax node is a block
        let blockAnchors = [];
        let string, stringLine, bI, isStringPlaced, anchor; // variables used in inner loops, but defined outside loop for efficiency
        let firstUncompletedBlockIdx = 0;
        let hasGroupedAllStrings;
        do {
            hasGroupedAllStrings = true;
            for (stringLine of strings) {
                hasGroupedAllStrings = hasGroupedAllStrings && stringLine.length === 0;
                if (stringLine.length === 0)
                    continue;
                string = stringLine.pop();
                let stringRange = { from: this.lineDistance(string.from, sourceText), to: this.lineDistance(string.to, sourceText) };
                isStringPlaced = false;
                for (bI = firstUncompletedBlockIdx; bI < blockAnchors.length; bI++) {
                    anchor = blockAnchors[bI];
                    if (anchor.to <= stringRange.from)
                        continue;
                    if (stringRange.to <= anchor.from) {
                        // it doesn't overlap with any existing blocks, but it comes right before this current block
                        if (bI === 0) {
                            blocks.unshift([string]); //create a new block
                            blockAnchors.unshift(stringRange); //set this as the block's anchor
                        }
                        else {
                            blocks.splice(bI, 0, [string]);
                            blockAnchors.splice(bI, 0, stringRange);
                        }
                        isStringPlaced = true;
                        break;
                    }
                    // at this point, `string` definitely overlaps with `anchor`
                    blocks[bI].push(string);
                    if (stringRange.from < anchor.from)
                        blockAnchors[bI] = stringRange; // change this block's anchor
                    isStringPlaced = true;
                    break;
                }
                if (!isStringPlaced) {
                    // string doesn't belong to any existing blocks, but comes after all existing blocks. 
                    // create new block that comes after all the existing ones.
                    blocks.push([string]);
                    blockAnchors.push(stringRange);
                    continue;
                }
            }
            // at this point, a block has definitely been grouped
            firstUncompletedBlockIdx += 1;
        } while (!hasGroupedAllStrings);
        // now we have all the blocks and their anchor nodes. now we use those anchor nodes to know what modifiers belong to what block
        let blockModifiers = [];
        let modifierRange;
        bI = 0;
        for (let modifier of modifiers) {
            modifierRange = { from: this.lineDistance(modifier.from, sourceText), to: this.lineDistance(modifier.to, sourceText) };
            anchor = blockAnchors[bI];
            if (!blockModifiers[bI])
                blockModifiers.push([]);
            while (anchor && anchor.to <= modifierRange.from) {
                anchor = blockAnchors[++bI];
            }
            if (!anchor || anchor.from >= modifierRange.to) {
                // if this modifier belongs to no block, add it to the nearest block on its left (and if none, the nearest on its right)
                let idx = bI === 0 ? 0 : bI - 1;
                blockModifiers[idx].push(modifier);
                continue;
            }
            blockModifiers[bI].push(modifier);
        }
        let tabBlocks = [];
        for (bI = 0; bI < blocks.length; bI++) {
            tabBlocks.push(new TabBlock({
                [SyntaxNodeTypes.Modifier]: blockModifiers[bI] || [],
                [SyntaxNodeTypes.TabString]: blocks[bI]
            }, this.offset));
        }
        this.disposeSourceNodes();
        return tabBlocks;
    }
    lineDistance(idx, sourceText) {
        return idx - sourceText.lineAt(idx).from;
    }
}
class TabBlock extends ASTNode {
    createChildren() {
        let result = [];
        let modifiers = this.sourceNodes[SyntaxNodeTypes.Modifier];
        for (let mod of modifiers) {
            result.push(Modifier.from(mod.name, { [mod.name]: [mod] }, this.offset));
        }
        let strings = this.sourceNodes[SyntaxNodeTypes.TabString];
        let measureLineNames = [];
        let measures = [];
        for (let string of strings) {
            // make sure multiplier is inserted as a child before all measures so it is traversed first
            let multiplier = string.getChild(SyntaxNodeTypes.Multiplier);
            if (multiplier)
                result.push(Modifier.from(multiplier.name, { [multiplier.name]: [multiplier] }, this.offset));
            let mlineName = string.getChild(SyntaxNodeTypes.MeasureLineName);
            if (mlineName)
                measureLineNames.push(mlineName);
            let measurelines = string.getChildren(SyntaxNodeTypes.MeasureLine);
            for (let i = 0; i < measurelines.length; i++) {
                if (!measures[i])
                    measures[i] = [];
                measures[i].push(measurelines[i]);
            }
        }
        result.push(new LineNaming({ [SyntaxNodeTypes.MeasureLineName]: measureLineNames }, this.offset));
        for (let i = 0; i < measures.length; i++) {
            result.push(new Measure({ [SyntaxNodeTypes.MeasureLine]: measures[i] }, this.offset));
        }
        this.disposeSourceNodes();
        return result;
    }
}
class Measure extends ASTNode {
    createChildren(sourceText) {
        var _a;
        let lines = this.sourceNodes[SyntaxNodeTypes.MeasureLine];
        let measureComponentsByLine = [];
        let mcAnchors = [];
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            measureComponentsByLine[i] = [];
            mcAnchors[i] = [];
            let cursor = line.cursor;
            if (!cursor.firstChild())
                continue;
            let cursorCopy = cursor.node.cursor;
            let connectorRecursionRoot = null;
            do {
                if (cursorCopy.type.is(SyntaxNodeTypes.Note) || cursorCopy.type.is(SyntaxNodeTypes.NoteDecorator)) {
                    measureComponentsByLine[i].push(cursorCopy.node);
                    if (cursorCopy.type.is(SyntaxNodeTypes.NoteDecorator)) {
                        mcAnchors[i].push(this.charDistance(line.from, (((_a = cursorCopy.node.getChild(SyntaxNodeTypes.Note)) === null || _a === void 0 ? void 0 : _a.from) || cursorCopy.from), sourceText));
                    }
                    else
                        mcAnchors[i].push(this.charDistance(line.from, cursorCopy.from, sourceText));
                    if (connectorRecursionRoot != null) {
                        cursorCopy = connectorRecursionRoot;
                        connectorRecursionRoot = null;
                    }
                    continue;
                }
                if (!cursorCopy.node.type.is(SyntaxNodeTypes.NoteConnector))
                    break;
                if (!connectorRecursionRoot)
                    connectorRecursionRoot = cursorCopy.node.cursor;
                measureComponentsByLine[i].push(cursorCopy.node);
                let connector = cursorCopy.node;
                let firstNote = connector.getChild(SyntaxNodeTypes.Note) || connector.getChild(SyntaxNodeTypes.NoteDecorator);
                if (firstNote) {
                    mcAnchors[i].push(this.charDistance(line.from, firstNote.from, sourceText));
                    cursorCopy = firstNote.cursor;
                }
                else {
                    mcAnchors[i].push(this.charDistance(line.from, connector.from, sourceText));
                }
            } while (cursorCopy.nextSibling());
        }
        // similar concept used in grouping TabStrings to make TabBlocks in the TabSegment.createChildren() class
        let sounds = [];
        let soundAnchors = [];
        let componentPointers = new Array(lines.length).fill(0);
        let component, componentAnchor, soundIdx, hasGroupedAllSounds, isComponentPlaced;
        let firstUncompletedSoundIdx = 0;
        do {
            hasGroupedAllSounds = true;
            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                component = measureComponentsByLine[lineNum][componentPointers[lineNum]];
                componentAnchor = mcAnchors[lineNum][componentPointers[lineNum]];
                hasGroupedAllSounds = hasGroupedAllSounds && !component;
                if (!component)
                    continue;
                isComponentPlaced = false;
                for (soundIdx = firstUncompletedSoundIdx; soundIdx < sounds.length; soundIdx++) {
                    if (soundAnchors[soundIdx] < componentAnchor)
                        continue;
                    if (componentAnchor < soundAnchors[soundIdx]) {
                        // component doesn't belong to any existing sound, but comes right before this current sound
                        if (soundIdx === 0) {
                            sounds.unshift([component]);
                            soundAnchors.unshift(componentAnchor);
                        }
                        else {
                            sounds.splice(soundIdx, 0, [component]);
                            soundAnchors.splice(soundIdx, 0, componentAnchor);
                        }
                        isComponentPlaced = true;
                        break;
                    }
                    sounds[soundIdx].push(component);
                    isComponentPlaced = true;
                    break;
                }
                // at this point we know this component does not belong to any exisiting sounds but comes after all existing sounds.
                if (!isComponentPlaced) {
                    sounds.push([component]);
                    soundAnchors.push(componentAnchor);
                }
                componentPointers[lineNum] = componentPointers[lineNum] + 1;
            }
            // at this point, we have definitely completed a sound
            firstUncompletedSoundIdx++;
        } while (!hasGroupedAllSounds);
        let result = [];
        for (let sound of sounds) {
            result.push(new Sound({ MultiType: sound }, this.offset));
        }
        return result;
    }
    charDistance(from, to, sourceText) {
        return sourceText.slice(from, to).toString().replace(/\s/g, '').length;
    }
}
class Sound extends ASTNode {
    createChildren() {
        let components = this.sourceNodes.MultiType; // TODO: MultiType does not correspond to any node in the Syntax Tree. Think of a better way to transfer this data
        let result = [];
        for (let component of components) {
            if (component.type.is(SyntaxNodeTypes.Note))
                result.push(Note.from(component.name, { [component.name]: [component] }, this.offset));
            else if (component.type.is(SyntaxNodeTypes.NoteDecorator))
                result.push(NoteDecorator.from(component.name, { [component.name]: [component] }, this.offset));
            else if (component.type.is(SyntaxNodeTypes.NoteConnector))
                result.push(NoteConnector.from(component.name, { [component.name]: [component] }, this.offset));
        }
        return result;
    }
}
class MeasureLineName extends ASTNode {
    getRootNodeTraverser() {
        return new AnchoredSyntaxCursor(this.sourceNodes[SyntaxNodeTypes.MeasureLineName][0], this.offset);
    }
    createChildren() { return []; }
}
class LineNaming extends ASTNode {
    createChildren() {
        let names = this.sourceNodes[SyntaxNodeTypes.MeasureLineName];
        return names.map((name) => new MeasureLineName({ [SyntaxNodeTypes.MeasureLineName]: [name] }, this.offset));
    }
}
class NoteConnector extends ASTNode {
    constructor() {
        super(...arguments);
        this.notes = [];
    }
    getRootNodeTraverser() {
        return new AnchoredSyntaxCursor(this.sourceNodes[this.getType()][0], this.offset);
    }
    // the raw parser parses note connectors recursively, so 5h3p2 would
    // parse as Hammer(5, Pull(3,2)), making the hammeron encompass also the fret 2
    // but the hammer relationship only connects 5 and 3, so we override the range computation to
    // reflect this fact.
    computeRanges(sourceNodes, offset) {
        let connector = sourceNodes[this.getType()][0];
        let notes = this.getNotesFromNoteConnector(connector);
        this.notes = [];
        if (notes.length === 0) {
            this.notes = [];
            return [connector.from - offset, connector.to - offset];
        }
        else if (notes.length === 1) {
            this.notes = notes;
            return [Math.min(connector.from, notes[0].from) - offset, Math.max(connector.to, notes[0].to) - offset];
        }
        else {
            this.notes = [notes[0], notes[1]];
            return [notes[0].from - offset, notes[1].to - offset];
        }
    }
    getNotesFromNoteConnector(connector) {
        let notes = [];
        let cursor = connector.cursor;
        let nestedConnectorExit = null;
        if (!cursor.firstChild())
            return [];
        do {
            if (cursor.type.is(SyntaxNodeTypes.Note) || cursor.type.is(SyntaxNodeTypes.NoteDecorator)) {
                notes.push(cursor.node);
                if (nestedConnectorExit) {
                    cursor = nestedConnectorExit.cursor;
                    nestedConnectorExit = null;
                }
            }
            else if (cursor.type.is(SyntaxNodeTypes.NoteConnector)) {
                nestedConnectorExit = cursor.node;
                cursor.firstChild();
            }
        } while (cursor.nextSibling());
        return notes;
    }
    createChildren() { return this.notes.map((node) => Note.from(node.name, { [node.name]: [node] }, this.offset)); }
    static isNoteConnector(name) { return name in [SyntaxNodeTypes.Hammer, SyntaxNodeTypes.Pull, SyntaxNodeTypes.Slide]; }
    static from(type, sourceNodes, offset) {
        switch (type) {
            case SyntaxNodeTypes.Hammer: return new Hammer(sourceNodes, offset);
            case SyntaxNodeTypes.Pull: return new Pull(sourceNodes, offset);
            case SyntaxNodeTypes.Slide: return new Slide(sourceNodes, offset);
        }
        return null;
    }
}
class Hammer extends NoteConnector {
    getType() { return SyntaxNodeTypes.Hammer; }
}
class Pull extends NoteConnector {
    getType() { return SyntaxNodeTypes.Pull; }
}
class Slide extends NoteConnector {
    getType() { return SyntaxNodeTypes.Slide; }
}
class NoteDecorator extends ASTNode {
    getRootNodeTraverser() {
        return new AnchoredSyntaxCursor(this.sourceNodes[this.getType()][0], this.offset);
    }
    createChildren() {
        let note = this.sourceNodes[this.getType()][0].getChild(SyntaxNodeTypes.Note);
        if (!note)
            return [];
        return [Note.from(note.name, { [note.name]: [note] }, this.offset)];
    }
    static from(type, sourceNodes, offset) {
        switch (type) {
            case SyntaxNodeTypes.Grace: return new Grace(sourceNodes, offset);
            case SyntaxNodeTypes.Harmonic: return new Harmonic(sourceNodes, offset);
        }
        return null;
    }
}
class Grace extends NoteDecorator {
    getType() { return SyntaxNodeTypes.Grace; }
}
class Harmonic extends NoteDecorator {
    getType() { return SyntaxNodeTypes.Harmonic; }
}
class Note extends ASTNode {
    createChildren() { return []; }
    getRootNodeTraverser() {
        return new AnchoredSyntaxCursor(this.sourceNodes[this.getType()][0], this.offset);
    }
    static from(type, sourceNodes, offset) {
        switch (type) {
            case SyntaxNodeTypes.Fret: return new Fret(sourceNodes, offset);
        }
        return null;
    }
}
class Fret extends Note {
    getType() { return SyntaxNodeTypes.Fret; }
}
// modifiers
class Modifier extends ASTNode {
    getRootNodeTraverser() {
        return new AnchoredSyntaxCursor(this.sourceNodes[this.getType()][0], this.offset);
    }
    createChildren() {
        return [];
    }
    static from(type, sourceNodes, offset) {
        switch (type) {
            case SyntaxNodeTypes.Repeat: return new Repeat(sourceNodes, offset);
            case SyntaxNodeTypes.TimeSignature: return new TimeSignature(sourceNodes, offset);
            case SyntaxNodeTypes.Modifier: return new Multiplier(sourceNodes, offset);
        }
        return null;
    }
}
class Repeat extends Modifier {
    getType() { return SyntaxNodeTypes.Repeat; }
}
class TimeSignature extends Modifier {
    getType() { return SyntaxNodeTypes.TimeSignature; }
}
class Multiplier extends Modifier {
    getType() { return SyntaxNodeTypes.Multiplier; }
}

/// LinearParser enables gradual parsing of a raw syntax node into an array-based tree data structure efficiently using a singly-linked-list-like structure
// the demo below shows how the LinearParser works (the underscores (_xyz_) show what nodes are added in a given step)
// init:      [_rootNode_]
// advance(): [rootNode, _rootNodeChild1, rootNodeChild2, rootNodeChild3..._]
// advance(): [rootNode, rootNodeChild1, _rootNodeChild1Child1, rootNodeChild1Child2, ..._, rootNodeChild2, rootNodeChild3...]
// ...
// This is done using a singly-linked list to make it more efficient than performing array insert operations.
class LinearParser {
    constructor(initialNode, 
    /// The index of all the parsed content will be relative to this offset
    /// This is usually the index of the source TabFragment, to make 
    /// for efficient relocation of TabFragments
    offset, sourceText) {
        this.offset = offset;
        this.sourceText = sourceText;
        // TODO: you might want to change this later to a Uint16array with the following format:
        // [node1typeID, length, rangeLen, ranges..., node2typeID, ...]
        // To do this, you will have to modify the ASTNode.increaseLength() function to account 
        // for the fact that different nodes can have different ranges.
        // not sure if better or worse for time/memory efficiency
        this.nodeSet = [];
        this.head = null;
        this.ancestryStack = [];
        this.cachedIsValid = null;
        if (initialNode.name !== TabFragment.AnchorNode)
            throw new Error("Parsing starting from a node other than the TabFragment's anchor node is not supported at this time.");
        let initialContent = [new TabSegment({ [TabFragment.AnchorNode]: [initialNode] }, offset)];
        this.head = new LPNode(initialContent, null);
    }
    advance() {
        if (!this.head)
            return this.nodeSet;
        let content = this.head.getNextContent();
        if (!content) {
            this.head = this.head.next;
            this.ancestryStack.pop();
            return null;
        }
        this.nodeSet.push(content);
        this.ancestryStack.push(this.nodeSet.length - 1);
        let children = content.parse(this.sourceText);
        for (let ancestor of this.ancestryStack) {
            this.nodeSet[ancestor].increaseLength(children);
        }
        this.head = new LPNode(children, this.head);
        return null;
    }
    get isDone() { return this.head == null; }
    get isValid() {
        if (this.cachedIsValid !== null)
            return this.cachedIsValid;
        if (!this.isDone)
            return false;
        let nodeSet = this.advance();
        if (!nodeSet)
            return true; //this should never be the case cuz we've finished parsing, but just to be sure...
        let hasMeasureline = false;
        outer: for (let node of nodeSet) {
            if (node.name !== Measure.name)
                continue;
            for (let i = 1; i < node.ranges.length; i += 2) {
                hasMeasureline = hasMeasureline || this.sourceText.slice(node.offset + node.ranges[i - 1], node.offset + node.ranges[i]).toString().replace(/\s/g, '').length !== 0;
                if (hasMeasureline)
                    break outer;
            }
        }
        this.cachedIsValid = hasMeasureline;
        return this.cachedIsValid;
    }
}
class LPNode {
    constructor(content, next) {
        this.content = content;
        this.next = next;
        this.contentPointer = 0;
    }
    getNextContent() {
        if (this.contentPointer >= this.content.length)
            return null;
        return this.content[this.contentPointer++];
    }
}

// TODO: consider replacing all occurences of editorState with sourceText where sourceText is editorState.doc
class TabFragment {
    constructor(from, to, rootNode, editorState, linearParser) {
        this.from = from;
        this.to = to;
        this.linearParser = linearParser;
        this.isBlankFragment = false;
        if (linearParser)
            return;
        if (!rootNode) {
            this.isBlankFragment = true;
            return;
        }
        if (rootNode.name !== TabFragment.AnchorNode)
            throw new Error("Incorrect node type used.");
        this.linearParser = new LinearParser(rootNode, this.from, editorState.doc);
    }
    // the position of all nodes within a tab fragment is relative to (anchored by) the position of the tab fragment
    static get AnchorNode() { return SyntaxNodeTypes.TabSegment; }
    advance() {
        if (this.isBlankFragment)
            return ASTCursor.dud;
        let nodeSet = this.linearParser.advance();
        return nodeSet ? (this.linearParser.isValid ? ASTCursor.from(nodeSet) : ASTCursor.dud) : null;
    }
    /// starts parsing this TabFragment from the raw SyntaxNode. this is made to be 
    /// incremental to prevent blocking when there are a lot of Tab Blocks on the same line
    static startParse(node, editorState) {
        if (node.name !== TabFragment.AnchorNode)
            return null;
        return new TabFragment(node.from, node.to, node, editorState);
    }
    /// Apply a set of edits to an array of fragments, removing
    /// fragments as necessary to remove edited ranges, and
    /// adjusting offsets for fragments that moved.
    static applyChanges(fragments, changes) {
        if (!changes.length)
            return fragments;
        let result = [];
        let fI = 1, nextF = fragments.length ? fragments[0] : null;
        for (let cI = 0, off = 0; nextF; cI++) {
            let nextC = cI < changes.length ? changes[cI] : null;
            // TODO: be careful here with the <=. test to make sure that it should be <= and not just <.
            while (nextF && (!nextC || nextF.from <= nextC.toA)) {
                if (!nextC || nextF.to <= nextC.fromA)
                    result.push(nextF.offset(-off));
                nextF = fI < fragments.length ? fragments[fI++] : null;
            }
            off = nextC ? nextC.toA - nextC.toB : 0;
        }
        return result;
    }
    offset(delta) {
        return new TabFragment(this.from + delta, this.to + delta, null, null, this.linearParser);
    }
    /// Create a set of fragments from a freshly parsed tree, or update
    /// an existing set of fragments by replacing the ones that overlap
    /// with a tree with content from the new tree.
    static addTree(tree, fragments = []) {
        let result = [...tree.getFragments()];
        for (let f of fragments)
            if (f.to > tree.to)
                result.push(f);
        return result;
    }
    static createBlankFragment(from, to) {
        return new TabFragment(from, to, null, null);
    }
    get cursor() {
        return this.isParsed ? this.advance() : null;
    }
    toString() {
        var _a;
        return ((_a = this.cursor) === null || _a === void 0 ? void 0 : _a.printTree()) || "";
    }
    get isParsed() { return this.isBlankFragment || this.linearParser.isDone; }
}
class TabTree {
    constructor(fragments) {
        this.fragments = fragments;
        this.from = fragments[0] ? fragments[0].from : 0;
        this.to = fragments[fragments.length - 1] ? fragments[fragments.length - 1].to : 0;
    }
    cursor() {
        return FragmentCursor.from(this.fragments);
    }
    static createBlankTree(from, to) {
        return new TabTree([TabFragment.createBlankFragment(from, to)]);
    }
    getFragments() { return this.fragments; }
    toString() {
        let str = "TabTree(";
        for (let fragment of this.fragments) {
            str += fragment.toString();
        }
        str += ")";
        return str;
    }
    /// Iterate over the tree and its children in an in-order fashion
    /// calling the spec.enter() function whenever a node is entered, and 
    /// spec.leave() when we leave a node. When enter returns false, that 
    /// node will not have its children iterated over (or leave called).
    iterate(spec) {
        for (let frag of this.fragments) {
            this.iterateHelper(spec, frag.cursor);
        }
    }
    iterateHelper(spec, cursor) {
        let explore;
        do {
            explore = spec.enter(cursor.node) === false ? false : true;
            if (explore === false)
                continue;
            if (cursor.firstChild()) {
                this.iterateHelper(spec, cursor);
                cursor.parent();
            }
            if (spec.leave)
                spec.leave(cursor.node);
        } while (cursor.nextSibling());
    }
}
TabTree.empty = new TabTree([]);

// TODO: credit https://github.com/lezer-parser/markdown/blob/main/src/markdown.ts
class Range {
    constructor(from, to) {
        this.from = from;
        this.to = to;
    }
}
class TabParser {
    /// Start a parse, returning a tab partial parse
    /// object. fragments can be passed in to
    /// make the parse incremental.
    ///
    /// By default, the entire input is parsed. You can pass `ranges`,
    /// which should be a sorted array of non-empty, non-overlapping
    /// ranges, to parse only those ranges. The tree returned in that
    /// case will start at `ranges[0].from`.
    startParse(editorState, fragments, ranges) {
        ranges = !ranges ? [new Range(0, editorState.doc.length)] : ranges.length ? ranges.map(r => new Range(r.from, r.to)) : [new Range(0, 0)];
        return this.createParse(editorState, fragments || [], ranges);
    }
    /// Run a full parse, returning the resulting tree.
    parse(editorState, fragments, ranges) {
        let parse = this.startParse(editorState, fragments, ranges);
        for (;;) {
            let done = parse.advance(100);
            if (done.tree)
                return done.tree;
        }
    }
}
// TODO: think of a better name for this class
class TabParserImplement extends TabParser {
    createParse(editorState, fragments, ranges) {
        return new PartialTabParseImplement(editorState, fragments || [], ranges);
    }
}
// TODO: Think of a better name for this class
class PartialTabParseImplement {
    /// @internal
    constructor(editorState, cachedFragments, ranges) {
        this.editorState = editorState;
        this.cachedFragments = cachedFragments;
        this.ranges = ranges;
        this.stoppedAt = null;
        this.fragments = [];
        this.editorState = editorState;
        this.text = editorState.doc.toString();
        this.to = ranges[ranges.length - 1].to;
        this.parsedPos = ranges[0].from;
    }
    getFragments() {
        return this.fragments;
    }
    advance(catchupTimeout = 25) {
        if (this.fragments.length !== 0 && !this.fragments[this.fragments.length - 1].isParsed) {
            this.fragments[this.fragments.length - 1].advance();
            return { blocked: false, tree: null };
        }
        if (this.stoppedAt !== null && this.parsedPos > this.stoppedAt)
            return { blocked: false, tree: this.finish() };
        if (this.parsedPos >= this.editorState.doc.length)
            return { blocked: false, tree: this.finish() };
        let rawSyntaxTree = ensureSyntaxTree(this.editorState, this.parsedPos, catchupTimeout);
        if (!rawSyntaxTree)
            return { blocked: true, tree: null };
        // TODO: we should probably not make reusing a fragment one single action because that creates a lot of overhead. we can quickly reuse multiple items, but doing it one by one wastes resources
        if (this.cachedFragments && this.reuseFragment(this.parsedPos))
            return { blocked: false, tree: null };
        // TODO: maybe handle case here where we may not want to reuse fragment because the fragment has been changed from what it actually is (maybe the rawparsetree didn't parse teh full tabsegment last time so we want to replace it with newly, fully parsed tab segment)
        let cursor = rawSyntaxTree.cursor();
        if (this.parsedPos === cursor.to) // we're at the end of partially-parsed raw syntax tree.
            return { blocked: true, tree: null };
        let endOfSyntaxTree = !cursor.firstChild();
        while (cursor.to <= this.parsedPos && !endOfSyntaxTree) {
            if ((endOfSyntaxTree = !cursor.nextSibling()))
                break;
        }
        let skipTo = null;
        if (endOfSyntaxTree) { // end of partial syntax tree
            skipTo = rawSyntaxTree.cursor().to;
        }
        else if (cursor.from > this.parsedPos) { // no node covers this.parsedPos (maybe it was skipped when parsing, like whitespace)
            skipTo = cursor.from;
        }
        else if (cursor.name !== TabFragment.AnchorNode) {
            skipTo = cursor.to;
        }
        if (skipTo) {
            skipTo = (cursor.from == cursor.to) ? skipTo + 1 : skipTo; // for zero-width error nodes, prevent being stuck in loop.
            let prevFrag = this.fragments[this.fragments.length - 1];
            let blankFrag;
            if (prevFrag.isBlankFragment) {
                // combine consecutive blank fragments into one.
                blankFrag = TabFragment.createBlankFragment(prevFrag.from, skipTo);
                this.fragments[this.fragments.length - 1] = blankFrag;
            }
            else {
                blankFrag = TabFragment.createBlankFragment(this.parsedPos, skipTo);
                this.fragments.push(blankFrag);
            }
            this.parsedPos = skipTo;
            return { blocked: false, tree: null };
        }
        let frag = TabFragment.startParse(cursor.node, this.editorState);
        this.fragments.push(frag);
        this.parsedPos = cursor.to;
        return { blocked: false, tree: null };
    }
    stopAt(pos) {
        if (this.stoppedAt !== null && this.stoppedAt < pos)
            throw new RangeError("Can't move stoppedAt forward");
        this.stoppedAt = pos;
    }
    finish() {
        //TODO: create the user-visible tree and return it.
        return new TabTree(this.fragments);
    }
    reuseFragment(start) {
        for (let fI = 0; fI < this.cachedFragments.length; fI++) {
            if (this.cachedFragments[fI].from > start)
                break;
            if (this.cachedFragments[fI].to > start) {
                if (this.cachedFragments[fI].isBlankFragment) {
                    // there might be a range overlap in the end of a 
                    // skipping fragment with the start of the subsequent, 
                    // proper fragment, so to make sure that we do not select 
                    // the skipping fragment instead of the proper fragment, we confirm
                    if (fI < this.cachedFragments.length - 1
                        && !this.cachedFragments[fI + 1].isBlankFragment
                        && this.cachedFragments[fI + 1].from <= start)
                        fI++;
                }
                this.fragments.push(this.cachedFragments[fI]);
                this.parsedPos = this.cachedFragments[fI].to;
                return true;
            }
        }
        return false;
    }
}

//TODO: give credit to https://github.com/codemirror/language/blob/main/src/language.ts
function defineTabLanguageFacet(baseData) {
    return Facet.define({
        combine: baseData ? values => values.concat(baseData) : undefined
    });
}
// nightmare to debug. i wanna cry
// This mirrors the `Language` class in @codemirror/language
class TabLanguage {
    ///
    constructor(
    /// The tablature data data facet used for this language (TODO: i don't understand this)
    data, parser, extraExtensions = []) {
        this.data = data;
        // kludge to define EditorState.tree as a debugging helper,
        // without the EditorState package actually knowing about it
        if (!EditorState.prototype.hasOwnProperty("tree")) {
            Object.defineProperty(EditorState.prototype, "tree", { get() { return tabSyntaxTree(this); } });
        }
        this.parser = parser;
        this.extension = [
            tabLanguage.of(this),
            EditorState.languageData.of((state, pos, side) => state.facet(tabLanguageDataFacetAt(state)))
        ].concat(extraExtensions);
    }
    /// Query whether this language is active at the given position
    isActiveAt(state, pos, side = -1) {
        return tabLanguageDataFacetAt(state) === this.data;
    }
    /// Indicates whether this language allows nested languages. The 
    /// default implementation returns true.
    get allowsNesting() { return false; }
    static define(spec) {
        // TODO: revisit this to make sure that this modification is correct
        let data = defineTabLanguageFacet(spec.languageData);
        return new TabLanguage(data, spec.parser);
    }
}
///@internal
TabLanguage.setState = StateEffect.define();
function tabLanguageDataFacetAt(state, pos, side) {
    let topLang = state.facet(tabLanguage);
    if (!topLang)
        return null;
    let facet = topLang.data;
    return facet;
}
/// Get the syntax tree for a state, which is the current (possibly
/// incomplete) parse tree of active language, or the empty tree 
/// if there is no language available.
function tabSyntaxTree(state) {
    let field = state.field(TabLanguage.state, false);
    return field ? field.tree : TabTree.empty;
}
/// Try to get a parse tree that spans at least up to `upto`. The
/// method will do at most `timeout` milliseconds of work to parse
/// up to that point if the tree isn't already available.
function ensureTabSyntaxTree(state, upto, timeout = 50) {
    var _a;
    let parse = (_a = state.field(TabLanguage.state, false)) === null || _a === void 0 ? void 0 : _a.context;
    return !parse ? null : parse.isDone(upto) || parse.work(timeout, upto) ? parse.tree : null;
}
/// Queries whether there is a full syntax tree available up to the 
/// given document position. If there isn't, the background parse
/// process _might_ still be working and update the tree further, but 
/// there is no guarantee of that-the parser will stop working when it 
/// has spent a certain amount of time or has moved beyond the visible
/// viewport. Always returns false if no language has been enabled.
function tabSyntaxTreeAvailable(state, upto = state.doc.length) {
    var _a;
    return ((_a = state.field(TabLanguage.state, false)) === null || _a === void 0 ? void 0 : _a.context.isDone(upto)) || false;
}
/// Tells you whether the language parser is planning to do more
/// parsing work (in a `requestIdleCallback` pseudo-thread) or has
/// stopped running, either because it parsed the entire document,
/// because it spent too much time and was cut off, or because there
/// is no language parser enabled.
function tabSyntaxParserRunning(view) {
    var _a;
    return ((_a = view.plugin(parseWorker)) === null || _a === void 0 ? void 0 : _a.isWorking()) || false;
}
let currentContext = null;
/// A parse context provided to parsers working on the editor content.
class ParseContext {
    /// @internal
    constructor(parser, 
    /// The current editor state.
    state, 
    /// Tree fragments that can be reused by incremental re-parses
    fragments = [], 
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
        this.parser = parser;
        this.state = state;
        this.fragments = fragments;
        this.tree = tree;
        this.treeLen = treeLen;
        this.viewport = viewport;
        this.skipped = skipped;
        this.scheduleOn = scheduleOn;
        this.parse = null;
        /// @internal
        this.tempSkipped = [];
    }
    startParse() {
        return this.parser.startParse(this.state, this.fragments);
    }
    /// @internal
    work(time, upto) {
        if (upto != null && upto >= this.state.doc.length)
            upto = undefined;
        if (this.tree !== TabTree.empty && this.isDone(upto !== null && upto !== void 0 ? upto : this.state.doc.length)) {
            this.takeTree();
            return true;
        }
        return this.withContext(() => {
            var _a;
            let endTime = Date.now() + time;
            if (!this.parse)
                this.parse = this.startParse();
            if (upto != null && (this.parse.stoppedAt === null || this.parse.stoppedAt > upto) &&
                upto < this.state.doc.length)
                this.parse.stopAt(upto);
            for (;;) {
                let { tree } = this.parse.advance();
                if (tree !== null) {
                    this.fragments = this.withoutTempSkipped(TabFragment.addTree(tree, this.fragments));
                    this.treeLen = (_a = this.parse.stoppedAt) !== null && _a !== void 0 ? _a : this.state.doc.length;
                    this.tree = tree;
                    this.parse = null;
                    // TODO: for some reason, this.parse.stoppedAt is always null when we reach the end of an incompltete tree
                    // and this prevents us from starting another parse
                    if (this.treeLen < (upto !== null && upto !== void 0 ? upto : this.state.doc.length))
                        this.parse = this.startParse();
                    else
                        return false;
                }
                if (Date.now() > endTime)
                    return false;
            }
        });
    }
    /// @internal
    takeTree() {
        let pos, tree;
        if (this.parse && (pos = this.parse.parsedPos) >= this.treeLen) {
            if (this.parse.stoppedAt === null || this.parse.stoppedAt > pos)
                this.parse.stopAt(pos);
            this.withContext(() => { while (!(tree = this.parse.advance(25 /* MinSlice */).tree)) { } });
            this.treeLen = pos;
            this.tree = tree;
            this.fragments = this.withoutTempSkipped(TabFragment.addTree(this.tree, this.fragments));
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
    withoutTempSkipped(fragments) {
        for (let r; r = this.tempSkipped.pop();) {
            fragments = cutFragments(fragments, r.from, r.to);
        }
        return fragments;
    }
    /// @internal
    changes(changes, newState) {
        let { fragments, tree, treeLen, viewport, skipped } = this;
        this.takeTree();
        if (!changes.empty) {
            let ranges = [];
            changes.iterChangedRanges((fromA, toA, fromB, toB) => ranges.push({ fromA, toA, fromB, toB }));
            fragments = TabFragment.applyChanges(fragments, ranges);
            tree = TabTree.empty;
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
        return new ParseContext(this.parser, newState, fragments, tree, treeLen, viewport, skipped, this.scheduleOn);
    }
    /// @internal
    updateViewport(viewport) {
        if (this.viewport.from === viewport.from && this.viewport.to === viewport.to)
            return false;
        this.viewport = viewport;
        let startLen = this.skipped.length;
        for (let i = 0; i < this.skipped.length; i++) {
            let { from, to } = this.skipped[i];
            if (from < viewport.to && to > viewport.from) {
                this.fragments = cutFragments(this.fragments, from, to); // TODO: understand this
                this.skipped.splice(i--, 1);
            }
        }
        if (this.skipped.length >= startLen)
            return false;
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
    skipUntilInView(from, to) {
        this.skipped.push({ from, to });
    }
    /// Returns a parser intended to be used as placeholder when
    /// asynchronously loading a nested parser. It'll skip its input and
    /// mark it as not-really-parsed, so that the next update will parse
    /// it again.
    ///
    /// When `until` is given, a reparse will be scheduled when that
    /// promise resolves.
    static getSkippingParser(until) {
        return new class extends TabParser {
            createParse(editorState, fragments, ranges) {
                let from = ranges[0].from, to = ranges[ranges.length - 1].to;
                let parser = {
                    parsedPos: from,
                    advance(catchupTimeout = 0) {
                        let cx = currentContext;
                        if (cx) {
                            for (let r of ranges)
                                cx.tempSkipped.push(r);
                            if (until)
                                cx.scheduleOn = cx.scheduleOn ? Promise.all([cx.scheduleOn, until]) : until;
                        }
                        this.parsedPos = to;
                        return { blocked: false, tree: TabTree.createBlankTree(from, to) };
                    },
                    stoppedAt: null,
                    stopAt() { },
                    getFragments() { return []; }
                };
                return parser;
            }
        };
    }
    /// @internal
    isDone(upto) {
        upto = Math.min(upto, this.state.doc.length);
        let frags = this.fragments;
        return this.treeLen >= upto && frags.length && frags[0].from === 0 && frags[frags.length - 1].to >= upto;
    }
    /// Get the context for the current parse, or `null` if no editor
    /// parse is in progress
    static get() { return currentContext; }
}
function cutFragments(fragments, from, to) {
    return TabFragment.applyChanges(fragments, [{ fromA: from, toA: to, fromB: from, toB: to }]);
}
class TabLanguageState {
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
        //TODO spend some time to understand this correctly.
        let upto = this.context.treeLen === tr.startState.doc.length ? undefined
            : Math.max(tr.changes.mapPos(this.context.treeLen), newCx.viewport.to);
        if (!newCx.work(20 /* Apply */, upto))
            newCx.takeTree();
        return new TabLanguageState(newCx);
    }
    static init(state) {
        let vpTo = Math.min(3000 /* InitViewport */, state.doc.length);
        let parseState = new ParseContext(state.facet(tabLanguage).parser, state, [], TabTree.empty, 0, { from: 0, to: vpTo }, [], null);
        if (!parseState.work(20 /* Apply */, vpTo))
            parseState.takeTree(); // TODO: understand this line
        return new TabLanguageState(parseState);
    }
}
TabLanguage.state = StateField.define({
    create: TabLanguageState.init,
    update(value, tr) {
        for (let e of tr.effects)
            if (e.is(TabLanguage.setState))
                return e.value; //look at the ParseWorker.work() method to see when we dispatch a setState StateEffect.
        if (tr.startState.facet(tabLanguage) !== tr.state.facet(tabLanguage))
            return TabLanguageState.init(tr.state);
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
const parseWorker = ViewPlugin.fromClass(class ParseWorker {
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
        let cx = this.view.state.field(TabLanguage.state).context;
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
        let { state } = this.view, field = state.field(TabLanguage.state);
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
        let field = state.field(TabLanguage.state);
        let time = Math.min(this.chunkBudget, 100 /* Slice */, deadline ? Math.max(25 /* MinSlice */, deadline.timeRemaining() - 5) : 1e9);
        let viewportFirst = field.context.treeLen < vpTo && state.doc.length > vpTo + 1000; //TODO i don't fully understand this line
        let done = field.context.work(time, vpTo + (viewportFirst ? 0 : 100000 /* MaxParseAhead */)); //i also don't fully understand this.
        this.chunkBudget -= Date.now() - now;
        if (done || this.chunkBudget <= 0) {
            field.context.takeTree();
            this.view.dispatch({ effects: TabLanguage.setState.of(new TabLanguageState(field.context)) });
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
                .catch(err => logException(this.view.state, err))
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
// This mirrors the `language` facet in @codemirror/language
const tabLanguage = Facet.define({
    combine(tabLanguages) { return tabLanguages.length ? tabLanguages[0] : null; },
    enables: [TabLanguage.state, parseWorker]
});
/// This class bundles a TabLanguage object with an 
/// optional set of supporting extensions. TabLanguage packages are 
/// encouraged to export a function that optionally takes a 
/// configuration object and returns a `TabLanguageSupport` instance, as 
/// the main way for client code to use the package
class TabLanguageSupport {
    /// Create a support object
    constructor(
    /// The language object.
    tabLanguage, 
    /// An optional set of supporting extensions.
    support = []) {
        this.tabLanguage = tabLanguage;
        this.support = support;
        this.extension = [tabLanguage, support];
    }
}

export { ASTCursor, ASTNode, FragmentCursor, ParseContext, TabLanguage, TabLanguageSupport, TabParserImplement, TabTree, defineTabLanguageFacet, ensureTabSyntaxTree, tabLanguage, tabLanguageDataFacetAt, tabSyntaxParserRunning, tabSyntaxTree, tabSyntaxTreeAvailable };
//# sourceMappingURL=index.js.map
