import { EditorState } from "@codemirror/state";
import { parser } from "parser-tablature";
import { FragmentCursor } from "./tree/cursors";
import { TabFragment } from "./tree/tab_fragment";

let str = `
E|---------------------------||-15p12h10p9-12p10-6p5-8p6-----|
B|---------------------------||-     -  - -7---------------------8-5-|
G|---------------------------||------------------------------|
D| -  -[7]----------------------||------------------------------|
A|--[7]----------------------||------------------------------|
E|--[7]----------------------||------------------------------|

E|--0-----------------------|-------------------------|
B|------------------3-----5-|-2-----------------------|
G|------------------3-------|-2-----------------------|
D|------------------5-------|-2-----------------------|
A|--------------------------|-0-----------------------|
E|--------------------------|-------------------------|
` 

let editorState = EditorState.create({
    doc: str   
})

let tree = parser.parse(str);
console.log(prettyPrint(tree.toString()));
let x = tree.cursor()
x.firstChild()
let tabFragment = TabFragment.startParse(x.node, editorState);
let cursor: FragmentCursor;
let i = 0;
while (!(cursor = tabFragment.advance())) { 
    i++;
    if (i==109) {
        console.log("wait");
    }
}
prettyPrint(cursor.printTree());



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