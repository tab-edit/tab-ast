import { Input, Parser, PartialParse, TreeFragment } from "@lezer/common";


class ASTParser extends Parser {
    createParse(input: Input, fragments: readonly TreeFragment[], ranges: readonly { from: number; to: number; }[]): PartialParse {
        
    }
}