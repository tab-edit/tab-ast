import { EditorState } from "@codemirror/state";
import { parser } from "parser-tablature";
import { FragmentCursor } from "../src/structure/cursors";
import { TabFragment } from "../src/structure/fragment";



test("very general and badly written test", () => {
    let str = `
    E|---------------------------||-15p12h10p9-12p10-6p5-8p6-----|
    B|---------------------------||-     -  - -7---------------------8-5-|
    G|---------------------------||------------------------------|
    D| -  -[7]----------------------||------------------------------|
    A|--[7]----------------------||------------------------------|
    E|--[7]----------------------||------------------------------|

    E|--0-----------------------|-------------------------|
    B|------------------3--  ---5-|-2-----------------------|
    G|----------------- -3-------|     -2-----------------------|
    D|------------------5-------| -2-----------------------|
    A|--------------------------|-0-----------------------|
    E|--------------------------|-------------------------|
    `;
    let editorState = EditorState.create({
        doc: str   
    })
    let tree = parser.parse(str);
    let x = tree.cursor();
    x.firstChild();
    let tabFragment = TabFragment.startParse(x.node, editorState);
    let cursor: FragmentCursor;
    let i = 0;
    while (!(cursor = tabFragment.advance())) { 
        i++;
        if (i==49) {
            console.log("wait");
        }
    }

    // the expected syntax tree for the first TabSegment in the above input
    let expected = `TabSegment(
        TabBlock(
          LineNaming(
            MeasureLineName,MeasureLineName,MeasureLineName,MeasureLineName,MeasureLineName,MeasureLineName
          ),
          Measure(
            Sound(
              Harmonic(Fret),Harmonic(Fret),Harmonic(Fret)
            )
          ),
          Measure(
            Sound(
                Pull(Fret,Fret)
            ),
            Sound(
                Fret,Hammer(Fret,Fret)
            ),
            Sound(
                Pull(Fret,Fret)
            ),
            Sound(
                Fret
            ),
            Sound(
              Pull(Fret,Fret)
            ),
            Sound(
              Fret
            ),
            Sound(
              Pull(Fret,Fret)
            ),
            Sound(
              Fret
            ),
            Sound(
              Pull(Fret,Fret)
            ),
            Sound(
              Fret
            )
            ,Sound(
              Fret
            )
            ,Sound(
              Fret
            ) 
          ) 
        )
      )
      `
    expect(cursor.printTree().replace(/\s/g,'')).toBe(expected.replace(/\s/g, ''));
});



function prettyPrint(str:string) {
    let spaces = 0;
    let spaceConst = "  ";
    let newStr = "";
    for (let char of str) {
        if (char!=")") newStr+=char;
        if (char=="(") {
            spaces++;
            newStr += "\n";
        }
        if (char==")") {
            spaces--;
            newStr+="\n";
            for (let i=0; i<spaces; i++) {
                newStr+=spaceConst;
            }
            newStr+=char;
            newStr+="\n"
        }
        if (char=="(" || char=="\n" || char==")") {
            for (let i=0; i<spaces; i++) {
                newStr+=spaceConst;
            }
        }
    }
    return newStr;
}