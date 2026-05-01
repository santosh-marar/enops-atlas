"use client";

import {
  Background,
  BackgroundVariant,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { useRef, useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useNodeZoom } from "@/hooks/use-node-zoom";
import { useTableFilter } from "@/hooks/use-table-filter";
import { SHORTCUT_CONFIGS } from "@/lib/shortcuts-config";
import { useSchemaStore } from "@/store/use-schema-store";
import { ErrorBoundary } from "./error-boundary";
import { FlowToolbar } from "./flow-toolbar";
import { TableNode } from "./table-node";
import { TableSearch } from "./table-search";

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

function XYFlowsInner() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    setEdgeAnimated,
    isLoading,
    isLocked,
  } = useSchemaStore();

  const { filteredNodes, filteredEdges } = useTableFilter(
    nodes,
    edges,
    debouncedSearchQuery
  );

  const { handleNodeDoubleClick, isZoomed } = useNodeZoom({
    duration: 500,
    padding: 0.5,
    minZoom: 0.5,
    maxZoom: 1.5,
  });

  useKeyboardShortcuts({
    shortcuts: [
      {
        ...SHORTCUT_CONFIGS.SEARCH_TABLES,
        action: () => {
          searchInputRef.current?.focus();
        },
      },
    ],
    enabled: true,
  });

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
              attributionPosition="bottom-right"
              className={`bg-transparent dark:bg-transparent ${
                isLocked
                  ? "[&_.react-flow__edge]:pointer-events-none [&_.react-flow__node]:pointer-events-none"
                  : ""
              }`}
              defaultEdgeOptions={defaultEdgeOptions}
              edges={filteredEdges}
              edgesFocusable={!isLocked}
              elementsSelectable={!isLocked}
              fitView
              maxZoom={2}
              minZoom={0.2}
              nodes={filteredNodes}
              nodesConnectable={!isLocked}
              nodesDraggable={!isLocked}
              nodesFocusable={!isLocked}
              nodeTypes={nodeTypes}
              onEdgeClick={
                isLocked
                  ? undefined
                  : (_, edge) => setEdgeAnimated(edge.id, true)
              }
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
              onEdgesChange={onEdgesChange}
              onNodeDoubleClick={isLocked ? undefined : handleNodeDoubleClick}
              onNodesChange={isLocked ? undefined : onNodesChange}
              panOnDrag={isLocked ? true : [1, 2]}
              selectNodesOnDrag={!isLocked}
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
                className="rounded-lg border border-border/60 bg-card/75 px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-[0.18em] shadow-lg backdrop-blur-sm"
                position="top-left"
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
                onSearchChange={setSearchQuery}
                ref={searchInputRef}
                resultCount={
                  debouncedSearchQuery ? filteredNodes.length : nodes.length
                }
                searchQuery={searchQuery}
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

export default function XYFlows({ children }: { children?: React.ReactNode }) {
  return (
    <ReactFlowProvider>
      <XYFlowsInner />
      {children}
    </ReactFlowProvider>
  );
}
