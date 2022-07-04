import { LanguageSupport, LRLanguage } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { parser } from "parser-tablature";
import { default_blueprint } from "../src/blueprint/blueprint";
import { PartialTabParseImplement } from "../src/parsers/fragment_level_parser";

describe("fragment parser", () => {
    let parser: PartialTabParseImplement;
    test("should return null when text is blank", () => {
        const text = "      \n    \n    \t \t\n     ";
        let parser = createParserWithContent(text)
        let res = parser.advance()
        expect(res.blocked).toBe(false)
        expect(res.tree).toBeNull()
    })
    test("should return tree when parsed up to 'stoppedAt' position", () => {
        let parser = createParserWithContent("");
        parser.stopAt(10);

        parser.parsedPos = 10;
        expect(parser.advance().tree).not.toBeNull();

        parser.parsedPos = 12;
        expect(parser.advance().tree).not.toBeNull();
    })
})


function createParserWithContent(content: string) {
    let state = EditorState.create({
        doc: content,
        extensions: [getRawParserExtension()]
    })
    return new PartialTabParseImplement(state,[],[],default_blueprint);
}


function getRawParserExtension() {
    return new LanguageSupport(LRLanguage.define({parser: parser}))
}