"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AST = exports.ASTFragment = exports.ASTPartialParse = void 0;
/// ASTPartialParse should implement PartialParse, but it uses features that do not exactly conform to the PartialParse interface
class ASTPartialParse {
    // advance(): AST | null {
    //     // TODO
    //     //if (this.stoppedAt != null && this.parsedPos > this.stoppedAt)
    // }
    stopAt(pos) {
        if (this.stoppedAt != null && this.stoppedAt < pos)
            throw new RangeError("Can't move stoppedAt forward");
        this.stoppedAt = pos;
    }
}
exports.ASTPartialParse = ASTPartialParse;
/// ASTFragment should extend TreeFragment, but it uses features that do not exactly conform to the TreeFragment class
class ASTFragment {
    /// Apply a set of edits to an array of fragments, 
    /// removing or splitting fragments as necessary to remove edited ranges, and adjusting offsets for fragments that moved.
    static applyChanges(fragments, ranges) {
        /// TODO
    }
}
exports.ASTFragment = ASTFragment;
/// AST should extend Tree, but it uses features that don't conform to the Tree class
class AST {
    /// The empty tree
    static get empty() {
        return new AST();
    }
}
exports.AST = AST;
//# sourceMappingURL=parse-utils.js.map