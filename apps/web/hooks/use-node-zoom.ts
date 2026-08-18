import { useReactFlow } from "@xyflow/react";
import { useCallback, useState } from "react";

interface UseNodeZoomOptions {
  duration?: number;
  maxZoom?: number;
  minZoom?: number;
  padding?: number;
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
          duration,
          maxZoom,
          minZoom,
          nodes: [{ id: node.id }],
          padding,
        });
        setZoomedNodeId(node.id);
      }
    },
    [fitView, zoomedNodeId, duration, padding, minZoom, maxZoom]
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
    isZoomed: zoomedNodeId !== null,
    resetZoom,
    zoomedNodeId,
  };
}
