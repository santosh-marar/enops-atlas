import { create } from "zustand";
import {
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import {
  transformDbml,
  Column,
  Table as ParsedTable,
  TransformWarning,
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
  dbml: string;
  sql: string;
  tables: FlowTable[];
  nodes: Node[];
  edges: Edge[];
  warnings: TransformWarning[];
  error: string | null;
  isUpdating: boolean;
  isLoading: boolean;
  history: HistoryState[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  isLocked: boolean;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  setEdgeAnimated: (id: string, animated: boolean) => void;
  updateFromDBML: (dbml: string, preservePositions?: boolean) => Promise<void>;
  undo: () => void;
  redo: () => void;
  addToHistory: (nodes: Node[]) => void;
  toggleLock: () => void;
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
  dbml: "",
  sql: "",
  tables: [],
  nodes: [],
  edges: [],
  warnings: [],
  error: null,
  isUpdating: false,
  isLoading: false,
  history: [],
  historyIndex: -1,
  canUndo: false,
  canRedo: false,
  isLocked: false,

  setNodes: (nodes) => {
    set({ nodes });
    get().addToHistory(nodes);
  },

  setEdges: (edges) => set({ edges }),
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
  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    })),
  setEdgeAnimated: (id, isHovered) =>
    set((state) => {
      // Optimized: only update edges that need updating
      const updatedEdges = state.edges.map((edge) => {
        if (edge.id === id) {
          // Target edge being hovered
          if (edge.animated === isHovered) return edge; // No change needed

          return {
            ...edge,
            animated: isHovered,
            style: {
              ...edge.style,
              stroke: isHovered ? PRIMARY_STROKE : DEFAULT_STROKE,
              strokeWidth: isHovered ? 2 : 1.2,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 16,
              height: 16,
              color: isHovered ? PRIMARY_STROKE : DEFAULT_STROKE,
            },
          };
        }

        // Reset other animated edges when hovering a new edge
        if (isHovered && edge.animated) {
          return {
            ...edge,
            animated: false,
            style: {
              ...edge.style,
              stroke: DEFAULT_STROKE,
              strokeWidth: 1.2,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 16,
              height: 16,
              color: DEFAULT_STROKE,
            },
          };
        }

        return edge;
      });

      return { edges: updatedEdges };
    }),

  updateFromDBML: async (dbml: string, preservePositions: boolean = false) => {
    if (get().isUpdating) {
      console.warn("Schema update already in progress");
      return;
    }

    // Handle empty DBML - clear everything
    if (!dbml || dbml.trim() === "") {
      set({
        dbml: "",
        sql: "",
        tables: [],
        nodes: [],
        edges: [],
        warnings: [],
        error: null,
        isUpdating: false,
        isLoading: false,
      });
      return;
    }

    set({ isUpdating: true, isLoading: true, error: null });

    try {
      const result = transformDbml(dbml);
      const derivedWarnings: TransformWarning[] = [];

      // Get existing node positions if preserving
      const existingNodes = preservePositions ? get().nodes : [];
      const existingPositions = new Map(
        existingNodes.map(node => [node.id, node.position])
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
        tableRegistry.set(
          makeTableLookupKey(table.schema, table.name),
          table
        );
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
          makeTableLookupKey(relationship.parent.schema, relationship.parent.table)
        );
        const childTable = tableRegistry.get(
          makeTableLookupKey(relationship.child.schema, relationship.child.table)
        );

        if (!parentTable || !childTable) {
          derivedWarnings.push({
            message: "Relationship references unknown table",
            context: `${relationship.parent.schema}.${relationship.parent.table} -> ${relationship.child.schema}.${relationship.child.table}`,
          });
          return;
        }

        const parentColumn = parentTable.columns.find(
          (column) => column.name === relationship.parent.column
        );
        const childColumn = childTable.columns.find(
          (column) => column.name === relationship.child.column
        );

        if (!parentColumn || !childColumn) {
          derivedWarnings.push({
            message: "Relationship references unknown column",
            context: `${parentTable.displayLabel}.${relationship.parent.column} -> ${childTable.displayLabel}.${relationship.child.column}`,
          });
          return;
        }

        edges.push({
          id: relationship.id,
          source: parentTable.id,
          sourceHandle: `${parentTable.id}-${relationship.parent.column}-source`,
          target: childTable.id,
          targetHandle: `${childTable.id}-${relationship.child.column}-target`,
          type: "smoothstep",
          animated: false,
          // label: `${parentTable.displayLabel}.${relationship.parent.column} → ${childTable.displayLabel}.${relationship.child.column}`,
          style: {
            strokeWidth: 1.2,
            stroke: DEFAULT_STROKE,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: DEFAULT_STROKE,
          },
        });
      });

      let nodes: Node[] = flowTables.map((table) => {
        const tableKey = `${table.schema}.${table.name}`;
        const sourceColumnSet = sourceColumns.get(tableKey) || new Set();

        return {
          id: table.id,
          type: "table",
          position: table.position,
          data: {
            label: table.name,
            schema: table.schema,
            alias: table.alias,
            columns: table.columns,
            sourceColumns: Array.from(sourceColumnSet), // columns that are sources for relationships
          },
        };
      });

  
      set({
        dbml,
        sql: result.sql,
        tables: flowTables,
        nodes,
        edges,
        warnings: [...result.warnings, ...derivedWarnings],
        error: null,
        isUpdating: false,
        isLoading: false,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to parse DBML";

      set({
        isUpdating: false,
        isLoading: false,
        error: errorMessage,
      });

      throw new Error(errorMessage);
    }
  },

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
      history: newHistory,
      historyIndex: newHistory.length - 1,
      canUndo: newHistory.length > 1,
      canRedo: false,
    });
  },

  undo: () => {
    const { history, historyIndex } = get();

    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const previousState = history[newIndex];

      set({
        nodes: previousState.nodes,
        historyIndex: newIndex,
        canUndo: newIndex > 0,
        canRedo: true,
      });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();

    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const nextState = history[newIndex];

      set({
        nodes: nextState.nodes,
        historyIndex: newIndex,
        canUndo: true,
        canRedo: newIndex < history.length - 1,
      });
    }
  },

  toggleLock: () => {
    set((state) => ({ isLocked: !state.isLocked }));
  },
}));
