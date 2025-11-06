import { useMemo } from "react";
import { Node, Edge } from "@xyflow/react";

export function useTableFilter(
  nodes: Node[],
  edges: Edge[],
  searchQuery: string
) {
  // Filter nodes based on search query
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes;

    const query = searchQuery.toLowerCase();
    return nodes.filter((node) => {
      const nodeData = node.data as any;
      const label = String(nodeData?.label || "").toLowerCase();
      const schema = String(nodeData?.schema || "").toLowerCase();
      const columns = Array.isArray(nodeData?.columns) ? nodeData.columns : [];

      // Search in table name
      if (label.includes(query)) return true;

      // Search in schema name
      if (schema.includes(query)) return true;

      // Search in column names
      return columns.some((col: any) =>
        col && typeof col === 'object' && col.name &&
        String(col.name).toLowerCase().includes(query)
      );
    });
  }, [nodes, searchQuery]);

  // Filter edges to only show connections between visible nodes
  const filteredEdges = useMemo(() => {
    const visibleNodeIds = new Set(filteredNodes.map((node) => node.id));
    return edges.filter(
      (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );
  }, [edges, filteredNodes]);

  return { filteredNodes, filteredEdges };
}
