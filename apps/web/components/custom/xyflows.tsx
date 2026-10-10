"use client";

import { getNeighborhood, tableKey } from "@enops/atlas-graph";
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
import { useMemo, useRef, useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useNodeZoom } from "@/hooks/use-node-zoom";
import { useTableFilter } from "@/hooks/use-table-filter";
import { analyzeDbml } from "@/lib/atlas";
import { SHORTCUT_CONFIGS } from "@/lib/shortcuts-config";
import { useSchemaStore } from "@/store/use-schema-store";
import { ErrorBoundary } from "./error-boundary";
import { FlowToolbar } from "./flow-toolbar";
import { TableNode } from "./table-node";
import { TableSearch } from "./table-search";

const nodeTypes = {
  table: TableNode as any,
};

const MAX_HIGHLIGHTED_TABLES = 40;
const DIMMED_OPACITY = 0.2;

const defaultEdgeOptions = {
  markerEnd: {
    color: "var(--muted-foreground)",
    height: 16,
    type: MarkerType.ArrowClosed,
    width: 16,
  },
  style: {
    stroke: "var(--muted-foreground)",
    strokeWidth: 1.2,
  },
  type: "smoothstep" as const,
};

// Node ids use the table alias; the graph uses schema.name.
const graphKeyOf = (node: { data: unknown }) => {
  const data = node.data as { label?: string; schema?: string };
  return tableKey(data.schema ?? "public", data.label ?? "");
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
    dbml,
  } = useSchemaStore();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const { filteredNodes, filteredEdges } = useTableFilter(
    nodes,
    edges,
    debouncedSearchQuery
  );

  // Tables one hop away from the clicked table; everything else is dimmed.
  const graph = useMemo(() => {
    try {
      return analyzeDbml(dbml).graph;
    } catch {
      return null;
    }
  }, [dbml]);

  const related = useMemo(() => {
    const selected = nodes.find((node) => node.id === selectedTable);
    if (!(selected && graph)) return null;
    return getNeighborhood(graph, [graphKeyOf(selected)], {
      hops: 1,
      maxNodes: MAX_HIGHLIGHTED_TABLES,
    });
  }, [graph, nodes, selectedTable]);

  const displayNodes = useMemo(
    () =>
      related
        ? filteredNodes.map((node) =>
            related.tables.has(graphKeyOf(node))
              ? node
              : { ...node, style: { ...node.style, opacity: DIMMED_OPACITY } }
          )
        : filteredNodes,
    [filteredNodes, related]
  );

  const displayEdges = useMemo(
    () =>
      related
        ? filteredEdges.map((edge) =>
            edge.source === selectedTable || edge.target === selectedTable
              ? edge
              : { ...edge, style: { ...edge.style, opacity: DIMMED_OPACITY } }
          )
        : filteredEdges,
    [filteredEdges, related, selectedTable]
  );

  const { handleNodeDoubleClick, isZoomed } = useNodeZoom({
    duration: 500,
    maxZoom: 1.5,
    minZoom: 0.5,
    padding: 0.5,
  });

  useKeyboardShortcuts({
    enabled: true,
    shortcuts: [
      {
        ...SHORTCUT_CONFIGS.SEARCH_TABLES,
        action: () => {
          searchInputRef.current?.focus();
        },
      },
    ],
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
              edges={displayEdges}
              edgesFocusable={!isLocked}
              elementsSelectable={!isLocked}
              fitView
              maxZoom={2}
              minZoom={0.2}
              nodes={displayNodes}
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
              onNodeClick={(_, node) =>
                setSelectedTable((current) =>
                  current === node.id ? null : node.id
                )
              }
              onNodeDoubleClick={isLocked ? undefined : handleNodeDoubleClick}
              onNodesChange={isLocked ? undefined : onNodesChange}
              onPaneClick={() => setSelectedTable(null)}
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
                  {related?.truncated && (
                    <span>Showing {MAX_HIGHLIGHTED_TABLES} related tables</span>
                  )}
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
