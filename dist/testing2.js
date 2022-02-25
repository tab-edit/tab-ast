"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const parser_tablature_1 = require("parser-tablature");
let str = `
E|--------------------------8-5-|
`;
let tree = parser_tablature_1.parser.parse(str);
let context = [];
let parent = [];
let printDeets = (x) => console.log(`name:${x.name} from:${x.from}(${str.charAt(x.from)}) to:${x.to}(${str.charAt(x.to)})`);
console.log(prettyPrint(tree.toString()));
let x = tree.cursor();
x.firstChild();
x.firstChild();
x.firstChild();
x.firstChild();
x.nextSibling();
x.nextSibling();
printDeets(x);
x.nextSibling();
printDeets(x);
x.nextSibling();
printDeets(x);
// tree.iterate({
//     enter(type, from, to, get) {
//         context.push({type,from,to,children});
//         parent.push(context.length-1)
//     }
//     leave
// })
function prettyPrint(str) {
    let spaces = 0;
    let spaceConst = "  ";
    let newStr = "";
    for (let char of str) {
        if (char != ")")
            newStr += char;
        if (char == "(") {
            spaces++;
            newStr += "\n";
        }
        if (char == ")") {
            spaces--;
            newStr += "\n";
            for (let i = 0; i < spaces; i++) {
                newStr += spaceConst;
            }
            newStr += char;
            newStr += "\n";
        }
        if (char == "(" || char == "\n" || char == ")") {
            for (let i = 0; i < spaces; i++) {
                newStr += spaceConst;
            }
        }
    }
    return newStr;
}
//# sourceMappingURL=testing2.js.map