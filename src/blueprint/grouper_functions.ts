import { Text } from "@codemirror/state";
import { SourceNode, SourceNodeTypes as S, ASTNodeTypes as A } from "../structure/nodes";
type LinearRange = {from:number, to:number}

/**
 * Arrange nodes into groups where every node in a group overlaps with a pivot node.
 * The node which is closest to the start of the line (or if there's a tie, the node
 * with smallest line number) becomes the pivot and the first node in each line which 
 * overlaps with that pivot forms a group.
 * pivot.
 * 
 * e.g.
 * NOTE: this example only makes sense if you're viewing it with a monospaced font!!!
 * 
 * this:
 * 
 *   |--a-| |-pivot2-|  
 * |-----pivot1-----| |-pivot3-|    
 *   |----b---| |---c---|   
 * 
 * becomes three groups:
 * 
 * |--a-|                       |-pivot2-|  
 * |-----pivot1-----|                               |-pivot3|   
 * |----b---|                   |---c---|   
 * 
 * pivot1 is the first pivot because it is closest to the start of the line.
 * it overlaps with a and b, so the three form a group. they are not considered
 * from hereon out. (all that's left is pivot2, pivot3 and c) pivot2 comes 
 * earliest in the line so it is the pivot of its own group. it only overlaps with c, so
 * it forms a group with c. All that's left is pivot3, which forms a group of its own.
 * 
 * This is used to group a bunch of TabString nodes arranged by lin into 
 * multiple TabBlocks (think one TabSegment(multiple TabStrings) node becomes multiple TabBlock nodes).
 * @param nodesGroupedByLine an array of node groups where each node group is a group of nodes that live on the same line, arranged in the order they appear on that line.
 * @param source_text the source text from which these nodes were parsed
 * @returns an array where each entry is a list of nodes which belong to the same group.
 */
export function createPivotalGrouping(nodesGroupedByLine: SourceNode[][], source_text: Text) {
    const groups:SourceNode[][] = [];
    const pivots:LinearRange[] = []

    // variables defined outside loop for efficiency
    let gI: number, node: SourceNode, nodeColRange: LinearRange, pivot: LinearRange;
    let nodePlacedInGroup: boolean;
    
    let groupingDone: boolean;
    for (let firstUncompletedGroupIdx=0; !groupingDone; firstUncompletedGroupIdx++) {
        groupingDone = true;
        for (let lineIdx=0; lineIdx<nodesGroupedByLine.length; lineIdx++) {
            node = nodesGroupedByLine[lineIdx][firstUncompletedGroupIdx];
            groupingDone &&= !node;
            if (!node) continue;

            nodeColRange = {from: columnDistance(node.from, source_text), to: columnDistance(node.to, source_text)}
            nodePlacedInGroup = false;
            for (gI=firstUncompletedGroupIdx; gI<groups.length; gI++) {
                pivot = pivots[gI]
                if (pivot.to <= nodeColRange.from) continue; // skip groups positioned before this node
                if (pivot.from >= nodeColRange.to) {
                    // This node doesn't overlap with any known groups
                    // so we create a new group
                    if (gI===0) {
                        groups.unshift([node]);
                        pivots.unshift(nodeColRange);
                    } else {
                        groups.splice(gI, 0, [node]);
                        pivots.splice(gI, 0, nodeColRange);
                    }
                    nodePlacedInGroup = true;
                    break;
                }
                // node overlaps with this group. add it to the group
                groups[gI].push(node);
                // this node is the new pivot of its group if it starts before current pivot.
                if (nodeColRange.from < pivot.from) pivots[gI] = nodeColRange;
                nodePlacedInGroup = true;
                break;
            }
            if (!nodePlacedInGroup) {
                // this node belongs to a new group
                // that comes after all existing groups.
                // it is in a group of its own
                groups.push([node]);
                pivots.push(nodeColRange);
                continue;
            }
        }
    }
    return groups;
}

/**
 * Arranges nodes into groups where the earliest nodes that appear in each
 * line form their own group, and this process repeats.
 * 
 * e.g. this:
 * |--|-----|---|
 *      |----|------|
 * |------|
 * 
 * becomes three groups:
 * |--|             |-----|             |---|
 * |----|           |------|
 * |------|         
 * 
 * This is used to group a bunch of MesureLine nodes arranged by line into multiple Measure nodes
 * @param nodesGroupedByLine an array of node groups where each node group is a group of nodes that live on the same line, arranged in the order they appear on that line.
 * @returns an array where each entry is a list of nodes which belong to the same group.
 */
export function createSequentialGrouping(nodesGroupedByLine: SourceNode[][]) {
    const groups = [];
    let groupingDone: boolean, line: SourceNode[], node: SourceNode;
    for (let gI=0; !groupingDone; gI++) {
        groupingDone = true;
        for (line of nodesGroupedByLine) {
            node = line[gI];
            if (!node) {
                groupingDone = false;
                continue;
            }
            if (groups[gI]) groups[gI].push(node);
            else groups[gI] = [node];
        }
    }
    return groups;
}

/**
 * Arranges components of a measure into groups based on which belong to the same sound.
 * Components whose notes have the same non-whitespace distance from the start of their measure line
 * belong to the same sound.
 * 
 * e.g.  
 *    |-   ---g7--3--4-|        when normalized, becomes this:     |----g7--3--4-|  
 * |-----8-- - --6-|                                               |-----8-----6-|  
 * 
 * and it produces these three sound groupings:
 * 
 *      |g7|    |3|     |4|
 *      |8|     | |     |6|
 * 
 * These two components "g7"(grace-7) and "8" belong to the same sound because
 * their notes "7" and "8" both have the same non-whitespace distance from
 * the start of their respective measure lines.
 *
 * @param componentsGroupedByLine an array of "Component" node groups where each node group is a group of nodes that live on the same line, arranged in the order they appear on that line.
 * @param measurelineStartIndices a parallel array to the `componentsGroupedByLine` array parameter where each entry is the start index of the measureline
 * @param source_text the source text from which these nodes were parsed
 */
export function createSoundGrouping(componentsGroupedByLine: SourceNode[][], measurelineStartIndices: number[], source_text: Text) {
    const distanceCache = new Map<SourceNode, number>();
    const getComponentDistance = (component: SourceNode, lineIdx: number) => {
        if (!distanceCache.has(component)) {
            const componentPosition = component.getChild(S.Note)?.from || component.from;
            distanceCache.set(component, nonWhitespaceDistance(measurelineStartIndices[lineIdx], componentPosition, source_text))
        }
        return distanceCache.get(component);
    }

    const sounds: SourceNode[][] = [];
    const pivotDistances: number[] = [];

    // variables defined outside loop for efficiency
    let sI: number, component: SourceNode, componentDistance: number, pivotDistance: number;
    let componentPlacedInSound: boolean;

    let groupingDone: boolean;
    for (let firstUncompletedSoundIdx=0; !groupingDone; firstUncompletedSoundIdx++) {
        groupingDone = true;
        for (let lineIdx=0; lineIdx<componentsGroupedByLine.length; lineIdx++) {
            component = componentsGroupedByLine[lineIdx][firstUncompletedSoundIdx];
            groupingDone &&= !component;
            if (!component) continue;

            componentDistance = getComponentDistance(component, lineIdx);
            componentPlacedInSound = false;
            for (sI=firstUncompletedSoundIdx; sI<sounds.length; sI++) {
                pivotDistance = pivotDistances[sI];
                if (pivotDistance < componentDistance) continue; // skip sounds positioned before this component
                if (pivotDistance > componentDistance) {
                    // component doesn't overlap with any known sounds
                    // so we create a new sound at this position.
                    if (sI===0) {
                        sounds.unshift([component]);
                        pivotDistances.unshift(componentDistance);
                    } else {
                        sounds.splice(sI, 0, [component]);
                        pivotDistances.splice(sI, 0, componentDistance);
                    }
                    componentPlacedInSound = true;
                    break;
                }
                // component overlaps with this sound. add it to the sound.
                sounds[sI].push(component);
                componentPlacedInSound = true;
                break;
            }
            if (!componentPlacedInSound) {
                // this component belongs to a new sound
                // that comes after all existing sounds.
                sounds.push([component]);
                pivotDistances.push(componentDistance);
                continue;
            }
        }
    }
    return sounds;
}

/**
 * Orders Sounds and Connectors in the appropriate order in which they apply (i.e. connector groups that
 * apply to a particular sound are placed right before the sound).
 * e.g. When we have the following measure:
 * 
 *  |-h---hh-------7-|
 *  |---7--p--7--p---|
 *  |-h-7--s------h7-|
 * 
 * Then it is separated into the following 9 groups:
 * 
 *      | |   | |   | |   | |   |h|   |h|   |h|   |7|   | |
 *      | |   |7|   |p|   |7|   | |   | |   | |   | |   |p|
 *      |h|   |7|   | |   | |   |s|   |h|   | |   |7|   | |
 * 
 * Note: We are allowing for multiple consecutive connector groups, even though it is semantically invalid.
 * It will be marked as an error by the linter. we are only focused on creating an accurate syntax tree.
 * 
 * How it works is we first group the sounds using the `createSoundGrouping` function.
 * Next we go through each sound and for each sound, we extract the connectors that appear right before a note in
 * that sound and those connectors form (one or more) connector groups that are ordered before the sound.
 * @param connectorsGroupedByLine an array of "Connector" node groups where each node group is a group of nodes that live on the same line, arranged in the order they appear on that line.
 * @param soundGroups An array of "Component" node groups where each node in a group belong to the same sound. It is the result of running the `createSoundGrouping` grouper function.
 * @param source_text the source text from which these nodes were parsed
 */
export function createConnectorSoundOrdering(connectorsGroupedByLine: SourceNode[][], soundGroups: SourceNode[][], source_text: Text) {
    const lineToConnectorList: Map<number, SourceNode[]> = new Map();
    const lineToConnectorPointer: Map<number, number> = new Map();
    for (const connectors of connectorsGroupedByLine) {
        if (connectors.length===0) continue;
        const line = lineNum(connectors[0].from, source_text);
        lineToConnectorList.set(line, connectors);
        lineToConnectorPointer.set(line, 0);
    }

    const connectorSoundOrdering: {type: A.ConnectorGroup|A.Sound, group: SourceNode[]}[] = []
    for (const sound of soundGroups) {
        let connectorGroupsBeforeSound: SourceNode[][] = [];
        for (const component of sound) {
            const componentLine = lineNum(component.from, source_text);
            const connectors = lineToConnectorList.get(componentLine);
            let pointer = lineToConnectorPointer.get(componentLine);
            if (!connectors || !connectors[pointer]) continue;

            for (let groupIdx=0; groupIdx < connectors.length-pointer; pointer++, groupIdx++) {
                const connector = connectors[pointer];

                if (connector.from >= component.from) break;
                if (!connectorGroupsBeforeSound[groupIdx]) connectorGroupsBeforeSound[groupIdx] = [connector];
                else connectorGroupsBeforeSound[groupIdx].push(connector);
            }

            lineToConnectorPointer.set(componentLine, pointer);
        }
        connectorSoundOrdering.concat(connectorGroupsBeforeSound.map(group => ({type: A.ConnectorGroup, group})))
        connectorSoundOrdering.push({type: A.Sound, group: sound})
    }

    // handle dangling connectors
    const danglingConnectors: SourceNode[][] = [];
    for (const connectors of connectorsGroupedByLine) {
        if (connectors.length===0) continue;
        const line = lineNum(connectors[0].from, source_text);
        let pointer = lineToConnectorPointer.get(line);

        for (let groupIdx=0; groupIdx < connectors.length-pointer; pointer++, groupIdx++) {
            const connector = connectors[pointer];
            if (!danglingConnectors[groupIdx]) danglingConnectors[groupIdx] = [connector];
            else danglingConnectors[groupIdx].push(connector);
        }
    }
    connectorSoundOrdering.concat(danglingConnectors.map(group => ({type: A.ConnectorGroup, group})))

    return connectorSoundOrdering;
}

function columnDistance(index:number, source_text: Text) {
    return index - source_text.lineAt(index).from;
}

function nonWhitespaceDistance(from: number, to: number, source_text: Text) {
    return source_text.slice(from, to).toString().replace(/\s/g, '').length;
}

function lineNum(index: number, source_text: Text) {
    return source_text.lineAt(index).number;
}