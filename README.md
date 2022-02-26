# tab-ast
A codemirror 6 extension that generates an abstract syntax tree from the [lezer](https://lezer.codemirror.net/) parse-tree generated by the [lang-tablature](https://github.com/Stan15/lang-tablature) codemirror extension.

As music tablature has column-wise/multiline/block-wise nodes that span across multiple lines (e.g. measures go across multiple lines, but there can be multiple measures per line) the regular parsing isn't sufficient (most, if not all, parsers don't support this). This project converts the parse tree generated from the lang-tablature project into an abstract syntax tree more representative of the real structure of music tablature and does so (hopefully) efficiently using incremental parsing.
