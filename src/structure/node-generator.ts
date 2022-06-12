import { Text } from "@codemirror/state"
import { NodeBlueprint } from "../blueprint/blueprint"
import { SourceNode } from "./nodes"

export type GroupedNodeList = {[nodeType: string]: SourceNode[]}

export class ASTNode {
    constructor(
        readonly name:string,
        readonly classList: string[],
        private sourceNodes: GroupedNodeList
    ) {}
}
export class NodeGenerator {
    constructor(
        private node_blueprint: NodeBlueprint,
        readonly source_text: Text
    ) {}

    /**
     * Constructs an ASTNode from a SourceNode object using the blueprint
     * @param sourceNode source
     * @returns an ASTNode object, or null if the sourceNode type does not have an entry in the blueprint.
     */
    generateNode(sourceNode: SourceNode): ASTNode | null {
        const blueprint = this.node_blueprint.blueprint[sourceNode.name];
        if (!blueprint) return null;

        const sourceNodes:GroupedNodeList = {}
        blueprint.sourceNodeTypes.forEach(type => {
            sourceNodes[type] = sourceNode.getChildren(type)
        });
        return new ASTNode(sourceNode.name, blueprint.classList, sourceNodes)
    }

    /**
     * Creates an ASTNode with the properties specified.
     * @param name the name of the node to be built
     * @param sourceNodes the sourceNodes from which this node is to be derived.
     * @returns an ASTNode object, or null if the blueprint does not have an entry for this node name.
     */
    buildNode(name: string, sourceNodes:GroupedNodeList): ASTNode | null {
        const blueprint = this.node_blueprint.blueprint[name];
        if (!blueprint) return null;
        return new ASTNode(name, blueprint.classList, sourceNodes);
    }
}