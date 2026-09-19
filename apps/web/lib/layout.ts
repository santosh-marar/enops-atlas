import type { Edge, Node } from "@xyflow/react";
import dagre from "dagre";

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB"
) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Calculate dynamic node dimensions based on content
  const getNodeDimensions = (node: Node) => {
    const data = node.data as any;
    const columnCount = data?.columns?.length || 0;

    // Base dimensions
    const baseWidth = 320;
    const baseHeight = 100;

    // Calculate height based on number of columns
    const rowHeight = 45;
    const height = Math.max(baseHeight, baseHeight + columnCount * rowHeight);

    return { height, width: baseWidth };
  };

  dagreGraph.setGraph({
    marginx: 50,
    marginy: 50,
    nodesep: 60,
    rankdir: direction,
    ranksep: 100,
  });

  nodes.forEach((node) => {
    const { width, height } = getNodeDimensions(node);
    dagreGraph.setNode(node.id, { height, width });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const { width, height } = getNodeDimensions(node);

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  return { edges, nodes: layoutedNodes };
}
