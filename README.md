# tab-ast
A codemirror 6 extension for generating an abstract syntax tree from music tablature files.

This acts as a sort-of "wrapper parser" around the existing [music tablature parser](https://github.com/tab-edit/parser-tablature), implementing support for multi-range nodes, which is essential to the semantics of music tablature where, for example, two measures can exist along the same group of lines, but are still distinct entities.
