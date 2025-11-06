"use client";

import {
  ReactFlow,
  Background,
  MiniMap,
  Panel,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useSchemaStore } from "@/store/use-schema-store";
import { TableNode } from "./table-node";
import { FlowToolbar } from "./flow-toolbar";
import { TableSearch } from "./table-search";
import { useTheme } from "next-themes";
import { ErrorBoundary } from "./error-boundary";
import { useState } from "react";
import { useTableFilter } from "@/hooks/use-table-filter";
import { useDebounce } from "@/hooks/use-debounce";

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
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    setEdgeAnimated,
    isLoading,
    isLocked,
  } = useSchemaStore();

  const { filteredNodes, filteredEdges } = useTableFilter(nodes, edges, debouncedSearchQuery);

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
              nodes={filteredNodes}
              edges={filteredEdges}
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
                    📊 {filteredNodes.length}/{nodes.length} Tables
                  </span>
                  <span>🔗 {filteredEdges.length} Relations</span>
                </div>
              </Panel>

              {/* Search Panel */}
              <TableSearch
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                resultCount={debouncedSearchQuery ? filteredNodes.length : nodes.length}
                totalCount={nodes.length}
              />

              <FlowToolbar />
            </ReactFlow>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
