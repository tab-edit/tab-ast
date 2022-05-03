# tab-ast
A CodeMirror 6 extension for generating an abstract syntax tree from ascii music tablature files.

This acts as a sort-of "wrapper parser" around the existing [music tablature parser](https://github.com/tab-edit/parser-tablature), implementing support for multi-range nodes, which is essential to the semantics of music tablature where, for example, two measures can exist along the same group of lines while still being distinct entities.
