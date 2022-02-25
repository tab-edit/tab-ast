import { EditorState } from "@codemirror/state";
import { Input, PartialParse, TreeFragment } from "@lezer/common";
import { LRParser } from "@lezer/lr";

export class PseudoParser extends LRParser {
    private state: EditorState;
    createParse(
        input: Input,
        fragments: readonly TreeFragment[],
        ranges: readonly {from: number, to: number}[]
    ): PartialParse {
        return new StatefulPartialParse(this, this.state, fragments, ranges);
    }
    setState(state: EditorState) {
        this.state = state;
    }
}

export class StatefulPartialParse implements PartialParse {
    constructor(
        readonly parser: PseudoParser,
        readonly ranges: readonly {from: number, to: number}[]
    ) {}
    advance() {

    }
}

