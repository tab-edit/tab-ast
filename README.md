# tab-ast
A CodeMirror 6 extension for generating a more semantically consistent abstract syntax tree from ascii music tablature files. It employs incremental parsing techniques to improve efficiency.

This parser is a wrapper around an existing parser - [tab-edit/parser-tablature](https://github.com/tab-edit/parser-tablature). It implements support for multi-range nodes. This allows the resulting syntax tree to be more consistent with the semantic structure of ascii tablature text where the syntax tree's nodes do not necessarily cover a single, continuous range. For example, a "Measure" node covers several ranges across different lines, as it is possible for two measures to reside on the same group of lines. 

Though it's structure aims to be structurally consistent with the semantics of tablature text, it aims to avoid providing any instrument-specific semantic detail in its syntax tree. This should handled by the [tab-edit/tab-state](https://github.com/tab-edit/tab-state) project.
