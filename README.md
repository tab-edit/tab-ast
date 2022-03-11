# tab-ast
A codemirror 6 extension that generates an abstract syntax tree from the [lezer](https://lezer.codemirror.net/) parse-tree generated by the [lang-tablature](https://github.com/Stan15/lang-tablature) codemirror extension.

Music tablature has nodes that span multiple ranges. (e.g. measures go across multiple lines, but there can be multiple measures per line) Capturing this nature of music tabs is not possible with conventional parsers which can only parse nodes from text going across an uninterrupted range. So to capture the true semantics of a music tab file, we need to perform additional grouping of nodes created using conventional parsing. This project aims to do so efficiently using incremental parsing.
