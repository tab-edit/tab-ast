import { createConnectorSoundOrdering, createPivotalGrouping, createSequentialGrouping, createSoundGrouping } from "./grouper_functions"
import { SourceNode, ASTNodeTypes as A, SourceNodeTypes as S } from "../structure/nodes"
import { ASTNode, GroupedNodeList, NodeGenerator } from "../structure/node-generator"

export type NodeBlueprint = {
    // anchor nodes must be one level below the top level of the parse tree
    anchors: Set<string>, 
    plans: {
        [nodeName: string]: {
            sourceNodeTypes: S[]
            classList?: string[]
            group?(sourceNodes: GroupedNodeList, generator: NodeGenerator): ASTNode[]
        }
    }
}

export const default_blueprint = {
    // All nodes are positioned relative to the anchor node within which they are positioned.
    top: S.Top,
    anchors: new Set([S.TabSegment, S.Comment]), 
    plans: {
        Comment: { sourceNodeTypes: [S.Comment] },
        TabSegment: {
            sourceNodeTypes: [S.Modifier, S.TabSegmentLine],
            group(sourceNodes, generator) {
                const result = [];
                result.concat(
                    sourceNodes[S.Modifier].map(generator.generateNode)
                    .filter(node => !!node)
                )

                const stringsByLine = sourceNodes[S.TabSegmentLine].map(segmentLine => segmentLine.getChildren(S.TabString))
                result.concat(
                    createPivotalGrouping(stringsByLine, generator.source_text)
                    .map(group => generator.constructNode(A.TabBlock, {
                        [S.TabString]: group
                    }))
                    .filter(node => !!node)
                )
                return result;
            }
        },
        TabBlock: {
            sourceNodeTypes: [S.TabString],
            group(sourceNodes, generator) {
                const result = []

                // first children are Multipliers
                sourceNodes[S.TabString].forEach(string => {
                    result.concat(string.getChildren(S.Multiplier).map(generator.generateNode))
                });

                // next is LineNaming
                const linenames:SourceNode[] = [];
                sourceNodes[S.TabString].forEach(string => {
                    linenames.push(string.getChild(S.MeasureLineName))
                })
                result.push(generator.constructNode(A.LineNaming, { [S.MeasureLineName]: linenames }));

                // next are Measures
                const measurelinesByLine:SourceNode[][] = [];
                sourceNodes[S.TabString].forEach(string => {
                    measurelinesByLine.push(string.getChildren(S.MeasureLine));
                })
                result.concat(
                    createSequentialGrouping(measurelinesByLine, generator.source_text)
                    .map(group => generator.constructNode(A.Measure, {
                        [S.MeasureLine]: group
                    }))
                )
                return result;
            }
        },
        LineNaming: {
            sourceNodeTypes: [S.MeasureLineName],
            group(sourceNodes, generator) {
                return sourceNodes[S.MeasureLineName].map(generator.generateNode)
            }
        },
        Measure: {
            sourceNodeTypes: [S.MeasureLine],
            group(sourceNodes, generator) {
                const componentsByLine: SourceNode[][] = [];
                const connectorsByLine: SourceNode[][] = [];
                const measurelineStartIndices: number[] = [];
                sourceNodes[S.MeasureLine].forEach(node => {
                    measurelineStartIndices.push(node.from);
                    componentsByLine.push(node.getChildren(S.Component));
                    connectorsByLine.push(node.getChildren(S.Connector));
                });

                const sounds = createSoundGrouping(componentsByLine, measurelineStartIndices, generator.source_text);
                const connectorSoundOrdering = createConnectorSoundOrdering(connectorsByLine, sounds, generator.source_text);

                const result = connectorSoundOrdering.map(grouping => {
                    if (grouping.type==A.ConnectorGroup) {
                        return generator.constructNode(A.ConnectorGroup, {
                            [S.Connector]: grouping.group
                        })
                    } else {
                        return generator.constructNode(A.Sound, {
                            [S.Component]: grouping.group
                        })
                    }
                })
                return result;
            }
        },
        ConnectorGroup: {
            sourceNodeTypes: [S.Connector],
            group(sourceNodes, generator) {
                return sourceNodes[S.Connector].map(generator.generateNode);
            }
        },
        Sound: {
            sourceNodeTypes: [S.Component],
            group(sourceNodes, generator) {
                return sourceNodes[S.Component].map(generator.generateNode);
            }
        },
        Multiplier: { sourceNodeTypes: [S.Multiplier] },
        MeasureLineName: { sourceNodeTypes: [S.MeasureLineName] },
        Connector: { sourceNodeTypes: [S.Connector] },
        Component: { sourceNodeTypes: [S.Component] }
    }
} as NodeBlueprint