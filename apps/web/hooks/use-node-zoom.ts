import { useState, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";

interface UseNodeZoomOptions {
  duration?: number;
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
}

export function useNodeZoom(options?: UseNodeZoomOptions) {
  const { fitView } = useReactFlow();
  const [zoomedNodeId, setZoomedNodeId] = useState<string | null>(null);

  const {
    duration = 500,
    padding = 0.5,
    minZoom = 0.5,
    maxZoom = 1.5,
  } = options || {};

  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      // If already zoomed to this node, zoom back to fit all nodes
      if (zoomedNodeId === node.id) {
        fitView({
          duration,
          padding: 0.2,
        });
        setZoomedNodeId(null);
      } else {
        // Zoom to the specific node
        fitView({
          nodes: [{ id: node.id }],
          duration,
          padding,
          minZoom,
          maxZoom,
        });
        setZoomedNodeId(node.id);
      }
    },
    [fitView, zoomedNodeId, duration, padding, minZoom, maxZoom],
  );

  const resetZoom = useCallback(() => {
    fitView({
      duration,
      padding: 0.2,
    });
    setZoomedNodeId(null);
  }, [fitView, duration]);

  return {
    handleNodeDoubleClick,
    resetZoom,
    zoomedNodeId,
    isZoomed: zoomedNodeId !== null,
  };
}
