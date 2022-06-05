
class ASTNode {
    constructor(
        readonly name:string,
        private classList: string[]
    ) {}
}

/*

Tablature-anchor
    [TabSegment]

TabSegment
    [Modifier]
    [TabSegmentLine] => [:TabBlock]     // :TabBlock use a different grouping method, by having an anchor node from which each group is 

TabBlock:[TabString]
    [Multiplier]
    [MeasureLineName] => :LineNaming      //  :LineNaming and :Measure use the same grouping method - just create a new group for each node that resides on the same line, and the nodes on the following line follow the same grouping sequentially (i.e. first falls under first group, second second, or creates a new group if more nodes on this line than groups that currently exist)
    [MeasureLine] => [:Measure]

LineNaming:[MeasureLineName]

Measure:[MeasureLine]
    [.MeasureComponent] => [:Sound]
*/