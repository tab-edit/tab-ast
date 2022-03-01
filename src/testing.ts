import { EditorState } from "@codemirror/state";
import { parser } from "parser-tablature";
import { FragmentCursor } from "./tree/cursors";
import { TabFragment } from "./tree/tab_fragment";

let str = `
E|---------------------------||-15p12h10p9-12p10-6p5-8p6-----|
B|---------------------------||--------------------------8-5-|
G|---------------------------||------------------------------|
D|--[7]----------------------||------------------------------|
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
while (!(cursor = tabFragment.advance())) {}
prettyPrint(cursor.printTree())
// x.firstChild()
// x.firstChild()
// x.firstChild()
// let printDeets = (x) => console.log(`name:${x.name} from:${x.from}(${str.charAt(x.from)}) to:${x.to}(${str.charAt(x.to)})`)
// printDeets(x)
// x.nextSibling()
// printDeets(x)



// tree.iterate({
//     enter(type, from, to, get) {
//         context.push({type,from,to,children});
//         parent.push(context.length-1)
//     }
//     leave
// })



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