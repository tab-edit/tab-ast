"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatefulPartialParse = exports.PseudoParser = void 0;
const lr_1 = require("@lezer/lr");
class PseudoParser extends lr_1.LRParser {
    createParse(input, fragments, ranges) {
        return new StatefulPartialParse(this, this.state, fragments, ranges);
    }
    setState(state) {
        this.state = state;
    }
}
exports.PseudoParser = PseudoParser;
class StatefulPartialParse {
    constructor(parser, ranges) {
        this.parser = parser;
        this.ranges = ranges;
    }
    advance() {
    }
}
exports.StatefulPartialParse = StatefulPartialParse;
//# sourceMappingURL=parser.js.map