"use client";

import {
  ReactFlow,
  Background,
  MiniMap,
  Panel,
  MarkerType,
  useReactFlow,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useSchemaStore } from "@/store/use-schema-store";
import { TableNode } from "./table-node";
import { FlowToolbar } from "./flow-toolbar";
import { useTheme } from "next-themes";
import { ErrorBoundary } from "./error-boundary";

const nodeTypes = {
  table: TableNode as any,
};

const defaultEdgeOptions = {
  type: "smoothstep" as const,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "var(--muted-foreground)",
    width: 16,
    height: 16,
  },
  style: {
    stroke: "var(--muted-foreground)",
    strokeWidth: 1.2,
  },
};

export default function XYFlows() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    setEdgeAnimated,
    isLoading,
    isLocked,
  } = useSchemaStore();

  return (
    <ErrorBoundary>
      <div className="relative h-full w-full from-background via-background to-background/80">
        <div className="h-full bg-background/60 font-mono text-sm backdrop-blur-sm">
          {nodes.length === 0 && !isLoading ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground">
                No tables to display. Add DBML schema to visualize.
              </p>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              fitView
              attributionPosition="bottom-right"
              minZoom={0.2}
              maxZoom={2}
              nodesDraggable={!isLocked}
              nodesConnectable={!isLocked}
              nodesFocusable={!isLocked}
              edgesFocusable={!isLocked}
              elementsSelectable={!isLocked}
              panOnDrag={!isLocked ? [1, 2] : true}
              selectNodesOnDrag={!isLocked}
              onNodesChange={isLocked ? undefined : onNodesChange}
              onEdgesChange={onEdgesChange}
              onEdgeMouseEnter={
                isLocked
                  ? undefined
                  : (_, edge) => setEdgeAnimated(edge.id, true)
              }
              onEdgeMouseLeave={
                isLocked
                  ? undefined
                  : (_, edge) => setEdgeAnimated(edge.id, false)
              }
              onEdgeClick={
                isLocked
                  ? undefined
                  : (_, edge) => setEdgeAnimated(edge.id, true)
              }
              className={`bg-transparent dark:bg-transparent ${
                isLocked
                  ? "[&_.react-flow__node]:pointer-events-none [&_.react-flow__edge]:pointer-events-none"
                  : ""
              }`}
            >
              <Background
                color={isDark ? "oklch(0.985 0 0)" : "oklch(0.145 0 0)"}
                gap={16}
                variant={BackgroundVariant.Dots}
              />
              <MiniMap
                className="!border !border-border/60 !bg-card/75 !shadow-lg !backdrop-blur"
                nodeBorderRadius={3}
              />
              <Panel
                position="top-left"
                className="rounded-lg border border-border/60 bg-card/75 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground shadow-lg backdrop-blur-sm"
              >
                <div className="flex items-center gap-4 text-foreground/80">
                  <span className="text-foreground">
                    📊 {nodes.length} Tables
                  </span>
                  <span>🔗 {edges.length} Relations</span>
                </div>
              </Panel>
              <FlowToolbar />
            </ReactFlow>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
