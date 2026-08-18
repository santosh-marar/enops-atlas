import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  MarkerType,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";
import { getLayoutedElements } from "@/lib/layout";
import {
  type Column,
  type Table as ParsedTable,
  type TransformWarning,
  transformDbml,
} from "@/lib/schema-transformer";

interface FlowTable extends ParsedTable {
  id: string;
  position: { x: number; y: number };
}

interface HistoryState {
  nodes: Node[];
  timestamp: number;
}

interface SchemaState {
  addToHistory: (nodes: Node[]) => void;
  canRedo: boolean;
  canUndo: boolean;
  dbml: string;
  edges: Edge[];
  error: string | null;
  history: HistoryState[];
  historyIndex: number;
  isLoading: boolean;
  isLocked: boolean;
  isUpdating: boolean;
  nodes: Node[];
  onEdgesChange: (changes: EdgeChange[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  redo: () => void;
  setEdgeAnimated: (id: string, animated: boolean) => void;
  setEdges: (edges: Edge[]) => void;
  setNodes: (nodes: Node[]) => void;
  showIde: boolean;
  sql: string;
  tables: FlowTable[];
  toggleIde: () => void;
  toggleLock: () => void;
  undo: () => void;
  updateFromDBML: (dbml: string, preservePositions?: boolean) => Promise<void>;
  warnings: TransformWarning[];
}

const DEFAULT_STROKE = "var(--muted-foreground)";
const PRIMARY_STROKE = "var(--primary)";

const makeTableLookupKey = (schema: string, tableName: string) =>
  `${schema}.${tableName}`;

/**
 * Formats default value for display in UI
 */
export function formatDefaultValue(column: Column): string {
  if (column.defaultValue === null || column.defaultValue === undefined) {
    return "NULL";
  }

  switch (column.defaultValueType) {
    case "expression":
      return String(column.defaultValue);
    case "string":
      return `'${column.defaultValue}'`;
    case "number":
      return String(column.defaultValue);
    case "boolean":
      return column.defaultValue ? "TRUE" : "FALSE";
    case "null":
      return "NULL";
    default:
      return String(column.defaultValue);
  }
}

const MAX_HISTORY = 50;

export const useSchemaStore = create<SchemaState>((set, get) => ({
  addToHistory: (nodes: Node[]) => {
    const { history, historyIndex } = get();

    // Remove any future history if we're not at the end
    const newHistory = history.slice(0, historyIndex + 1);

    // Add new state
    newHistory.push({
      nodes: JSON.parse(JSON.stringify(nodes)), // Deep clone
      timestamp: Date.now(),
    });

    // Limit history size
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }

    set({
      canRedo: false,
      canUndo: newHistory.length > 1,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },
  canRedo: false,
  canUndo: false,
  dbml: "",
  edges: [],
  error: null,
  history: [],
  historyIndex: -1,
  isLoading: false,
  isLocked: false,
  isUpdating: false,
  nodes: [],
  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    })),
  onNodesChange: (changes) => {
    const state = get();
    const newNodes = applyNodeChanges(changes, state.nodes);

    // Only add to history for position changes (drag)
    const hasPositionChange = changes.some(
      (change) => change.type === "position" && change.dragging === false
    );

    set({ nodes: newNodes });

    if (hasPositionChange) {
      state.addToHistory(newNodes);
    }
  },

  redo: () => {
    const { history, historyIndex } = get();

    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const nextState = history[newIndex];

      set({
        canRedo: newIndex < history.length - 1,
        canUndo: true,
        historyIndex: newIndex,
        nodes: nextState.nodes,
      });
    }
  },
  setEdgeAnimated: (id, isHovered) =>
    set((state) => {
      // Optimized: only update edges that need updating
      const updatedEdges = state.edges.map((edge) => {
        if (edge.id === id) {
          // Target edge being hovered
          if (edge.animated === isHovered) {
            return edge; // No change needed
          }

          return {
            ...edge,
            animated: isHovered,
            markerEnd: {
              color: isHovered ? PRIMARY_STROKE : DEFAULT_STROKE,
              height: 16,
              type: MarkerType.ArrowClosed,
              width: 16,
            },
            style: {
              ...edge.style,
              stroke: isHovered ? PRIMARY_STROKE : DEFAULT_STROKE,
              strokeWidth: isHovered ? 2 : 1.2,
            },
          };
        }

        // Reset other animated edges when hovering a new edge
        if (isHovered && edge.animated) {
          return {
            ...edge,
            animated: false,
            markerEnd: {
              color: DEFAULT_STROKE,
              height: 16,
              type: MarkerType.ArrowClosed,
              width: 16,
            },
            style: {
              ...edge.style,
              stroke: DEFAULT_STROKE,
              strokeWidth: 1.2,
            },
          };
        }

        return edge;
      });

      return { edges: updatedEdges };
    }),

  setEdges: (edges) => set({ edges }),

  setNodes: (nodes) => {
    set({ nodes });
    get().addToHistory(nodes);
  },
  showIde: true,
  sql: "",
  tables: [],

  toggleIde: () => {
    set((state) => ({ showIde: !state.showIde }));
  },

  toggleLock: () => {
    set((state) => ({ isLocked: !state.isLocked }));
  },

  undo: () => {
    const { history, historyIndex } = get();

    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const previousState = history[newIndex];

      set({
        canRedo: true,
        canUndo: newIndex > 0,
        historyIndex: newIndex,
        nodes: previousState.nodes,
      });
    }
  },

  updateFromDBML: async (dbml: string, preservePositions = false) => {
    if (get().isUpdating) {
      console.warn("Schema update already in progress");
      return;
    }

    // Handle empty DBML - clear everything
    if (!dbml || dbml.trim() === "") {
      set({
        dbml: "",
        edges: [],
        error: null,
        isLoading: false,
        isUpdating: false,
        nodes: [],
        sql: "",
        tables: [],
        warnings: [],
      });
      return;
    }

    set({ error: null, isLoading: true, isUpdating: true });

    try {
      const result = transformDbml(dbml);
      const derivedWarnings: TransformWarning[] = [];

      // Get existing node positions if preserving
      const existingNodes = preservePositions ? get().nodes : [];
      const existingPositions = new Map(
        existingNodes.map((node) => [node.id, node.position])
      );

      const flowTables: FlowTable[] = result.tables.map(
        (table: ParsedTable, index: number) => {
          const nodeId = `${table.schema}.${table.referenceName}`;
          const existingPosition = existingPositions.get(nodeId);
          return {
            ...table,
            id: nodeId,
            position: existingPosition || {
              x: 120 + (index % 4) * 320,
              y: 120 + Math.floor(index / 4) * 220,
            },
          };
        }
      );

      const tableRegistry = new Map<string, FlowTable>();
      flowTables.forEach((table) => {
        tableRegistry.set(makeTableLookupKey(table.schema, table.name), table);
      });

      // Track which columns are sources for relationships
      const sourceColumns = new Map<string, Set<string>>(); // tableId -> Set of column names
      result.relationships.forEach((rel) => {
        const tableId = `${rel.parent.schema}.${rel.parent.table}`;
        if (!sourceColumns.has(tableId)) {
          sourceColumns.set(tableId, new Set());
        }
        sourceColumns.get(tableId)!.add(rel.parent.column);
      });

      const edges: Edge[] = [];

      result.relationships.forEach((relationship) => {
        const parentTable = tableRegistry.get(
          makeTableLookupKey(
            relationship.parent.schema,
            relationship.parent.table
          )
        );
        const childTable = tableRegistry.get(
          makeTableLookupKey(
            relationship.child.schema,
            relationship.child.table
          )
        );

        if (!(parentTable && childTable)) {
          derivedWarnings.push({
            context: `${relationship.parent.schema}.${relationship.parent.table} -> ${relationship.child.schema}.${relationship.child.table}`,
            message: "Relationship references unknown table",
          });
          return;
        }

        const parentColumn = parentTable.columns.find(
          (column) => column.name === relationship.parent.column
        );
        const childColumn = childTable.columns.find(
          (column) => column.name === relationship.child.column
        );

        if (!(parentColumn && childColumn)) {
          derivedWarnings.push({
            context: `${parentTable.displayLabel}.${relationship.parent.column} -> ${childTable.displayLabel}.${relationship.child.column}`,
            message: "Relationship references unknown column",
          });
          return;
        }

        edges.push({
          animated: false,
          id: relationship.id,
          markerEnd: {
            color: DEFAULT_STROKE,
            height: 16,
            type: MarkerType.ArrowClosed,
            width: 16,
          },
          source: parentTable.id,
          sourceHandle: `${parentTable.id}-${relationship.parent.column}-source`,
          // label: `${parentTable.displayLabel}.${relationship.parent.column} → ${childTable.displayLabel}.${relationship.child.column}`,
          style: {
            stroke: DEFAULT_STROKE,
            strokeWidth: 1.2,
          },
          target: childTable.id,
          targetHandle: `${childTable.id}-${relationship.child.column}-target`,
          type: "smoothstep",
        });
      });

      let nodes: Node[] = flowTables.map((table) => {
        const tableKey = `${table.schema}.${table.name}`;
        const sourceColumnSet = sourceColumns.get(tableKey) || new Set();

        return {
          data: {
            alias: table.alias,
            columns: table.columns,
            label: table.name,
            schema: table.schema,
            sourceColumns: Array.from(sourceColumnSet), // columns that are sources for relationships
          },
          id: table.id,
          position: table.position,
          type: "table",
        };
      });

      // Apply dagre layout only for new schemas (not preserving positions)
      if (!preservePositions && nodes.length > 0) {
        const layouted = getLayoutedElements(nodes, edges);
        nodes = layouted.nodes;
      }

      set({
        dbml,
        edges,
        error: null,
        isLoading: false,
        isUpdating: false,
        nodes,
        sql: result.sql,
        tables: flowTables,
        warnings: [...result.warnings, ...derivedWarnings],
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to parse DBML";

      set({
        error: errorMessage,
        isLoading: false,
        isUpdating: false,
      });

      throw new Error(errorMessage);
    }
  },
  warnings: [],
}));
