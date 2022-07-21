import { Text } from "@codemirror/state"
import objectHash from "object-hash";
import { NodeBlueprint } from "../blueprint/blueprint"
import { SourceNode } from "./nodes"

export type GroupedNodeList = {[nodeType: string]: SourceNode[]}

export class ASTNode {
    constructor(
        readonly name:string,
        readonly classList: string[],
        readonly sourceNodes: GroupedNodeList
    ) {}

    private _descendantCount = 0;
    /**
     * The number of descendants this node has.
     * We need to keep track of this in order to traverse the
     * tree of nodes as we are using an array-based tree structure.
     */
    get descendantCount() { return this._descendantCount }
    private _parsed = 0;
    /**
     * Boolean flag indicating whether this node has been parsed, 
     * creating its direct descendants.
     */
    get parsed() { return this._parsed }

    

    /**
     * Increases the descendant count.
     * @param descendants The list of descendants which are being added to this node.
     */
    public increaseDecendantCount(descendants: ASTNode[]) {
        this._descendantCount += descendants.length;
    }
}

export class NodeGenerator {
    constructor(
        private node_blueprint: NodeBlueprint,
        readonly source_text: Text
    ) {}

    group(node: ASTNode) {
        return this.node_blueprint.plans[node.name].group(node.sourceNodes, this);
    }

    /**
     * Constructs an ASTNode from a SourceNode object using the blueprint
     * @param sourceNode source
     * @returns an ASTNode object, or null if the sourceNode type does not have an entry in the blueprint.
     */
    generateNode(sourceNode: SourceNode): ASTNode | null {
        const plan = this.node_blueprint.plans[sourceNode.name];

        const sourceNodes:GroupedNodeList = {}
        const sourceNodeTypes = plan ? plan.sourceNodeTypes : [sourceNode.name];
        sourceNodeTypes.forEach(type => {
            sourceNodes[type] = sourceNode.name == type ? [sourceNode] : sourceNode.getChildren(type);
        });
        return new ASTNode(sourceNode.name, plan?.classList || [], sourceNodes)
    }

    /**
     * Creates an ASTNode with the properties specified.
     * @param name the name of the node to be built
     * @param sourceNodes the sourceNodes from which this node is to be derived.
     * @returns an ASTNode object, or null if the blueprint does not have an entry for this node name.
     */
    constructNode(name: string, sourceNodes:GroupedNodeList): ASTNode | null {
        const blueprint = this.node_blueprint.plans[name];
        if (!blueprint) return null;
        return new ASTNode(name, blueprint.classList, sourceNodes);
    }
}