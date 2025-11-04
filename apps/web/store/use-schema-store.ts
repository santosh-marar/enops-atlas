import { create } from "zustand";
import { Parser, ModelExporter } from "@dbml/core";
import { Node, Edge } from "@xyflow/react";

interface Column {
  // Basic properties
  name: string;
  type: string;

  // Constraints
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  autoIncrement?: boolean;

  // Default values - STORE BOTH RAW VALUE AND TYPE INFO
  defaultValue?: string | number | boolean | null;
  defaultValueType?: "expression" | "string" | "number" | "boolean" | "null";

  // Foreign key
  foreignKey?: {
    table: string;
    column: string;
    onDelete?:
      | "CASCADE"
      | "SET NULL"
      | "RESTRICT"
      | "NO ACTION"
      | "SET DEFAULT";
    onUpdate?:
      | "CASCADE"
      | "SET NULL"
      | "RESTRICT"
      | "NO ACTION"
      | "SET DEFAULT";
  };

  // Indexes
  indexed?: boolean;
  indexType?: "btree" | "hash" | "gist" | "gin" | "brin";

  // String/Text specific
  length?: number;

  // Numeric specific
  precision?: number;
  scale?: number;
  unsigned?: boolean;

  // Additional metadata
  comment?: string;
  note?: string;

  // Validation/Check constraints
  check?: string;

  // Enum values (for ENUM types)
  enumValues?: string[];
}

interface Table {
  id: string;
  name: string;
  columns: Column[];
  position?: { x: number; y: number };
}

interface SchemaState {
  dbml: string;
  sql: string;
  tables: Table[];
  nodes: Node[];
  edges: Edge[];
  isUpdating: boolean;
  updateFromDBML: (dbml: string) => void;
}

/**
 * Parses default value from DBML parser output
 * Handles multiple formats:
 * - {type: 'number', value: 18}
 * - {type: 'string', value: 'active'}
 * - {type: 'boolean', value: true}
 * - {type: 'expression', value: 'now()'}
 * - null
 * - Raw primitives (fallback)
 */
function parseDefaultValue(dbdefault: any): {
  value: string | number | boolean | null;
  type: "expression" | "string" | "number" | "boolean" | "null";
} {
  // Handle null/undefined
  if (dbdefault === null || dbdefault === undefined) {
    return { value: null, type: "null" };
  }

  // Handle object format: {type: 'number', value: 18}
  if (
    typeof dbdefault === "object" &&
    "type" in dbdefault &&
    "value" in dbdefault
  ) {
    const { type, value } = dbdefault;

    switch (type) {
      case "number":
        return { value: Number(value), type: "number" };

      case "string":
        // Remove surrounding quotes if present
        const cleanString =
          typeof value === "string"
            ? value.replace(/^['"]|['"]$/g, "")
            : String(value);
        return { value: cleanString, type: "string" };

      case "boolean":
        return { value: Boolean(value), type: "boolean" };

      case "expression":
        return { value: String(value), type: "expression" };

      default:
        // Unknown type - treat as string
        // console.warn(`Unknown default value type: ${type}`, dbdefault);
        return { value: String(value), type: "string" };
    }
  }

  // Handle raw primitives
  if (typeof dbdefault === "number") {
    return { value: dbdefault, type: "number" };
  }
  if (typeof dbdefault === "boolean") {
    return { value: dbdefault, type: "boolean" };
  }
  if (typeof dbdefault === "string") {
    const isExpression = /\(|\)|now|current|uuid|gen_random/i.test(dbdefault);
    return {
      value: dbdefault,
      type: isExpression ? "expression" : "string",
    };
  }

  // Fallback
  // console.warn("Unexpected default value format:", dbdefault);
  return { value: String(dbdefault), type: "string" };
}

/**
 * Formats default value for display in UI
 */
export function formatDefaultValue(column: Column): string {
  if (column.defaultValue === null || column.defaultValue === undefined) {
    return "NULL";
  }

  switch (column.defaultValueType) {
    case "expression":
      return String(column.defaultValue); // now(), CURRENT_TIMESTAMP, etc.

    case "string":
      return `'${column.defaultValue}'`; // 'active'

    case "number":
      return String(column.defaultValue); // 18

    case "boolean":
      return column.defaultValue ? "TRUE" : "FALSE";

    case "null":
      return "NULL";

    default:
      return String(column.defaultValue);
  }
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  dbml: "",
  sql: "",
  tables: [],
  nodes: [],
  edges: [],
  isUpdating: false,

  updateFromDBML: (dbml: string) => {
    // Prevent concurrent updates
    if (get().isUpdating) {
      console.warn("Schema update already in progress");
      return;
    }

    // Validate input
    if (!dbml || dbml.trim() === "") {
      throw new Error("DBML string cannot be empty");
    }

    set({ isUpdating: true });

    try {
      // Parse DBML string
      const parser = new Parser();
      const model = parser.parse(dbml, "dbml");

      // Export to PostgreSQL
      const sql = ModelExporter.export(model, "postgres", false);

      // Extract first schema (most DBML files have one schema)
      const schema = model.schemas?.[0];

      if (!schema) {
        throw new Error("No schema found in DBML");
      }

      // Convert DBML tables to our internal format
      const tables: Table[] = schema.tables
        ? schema.tables.map((table: any, index: number) => {
            // Parse columns
            const columns: Column[] = table.fields.map((field: any) => {
              const column: Column = {
                name: field.name,
                type: field.type.type_name,
                nullable: !field.not_null,
                primaryKey: field.pk || false,
                unique: field.unique || false,
              };

              // Auto increment
              if (field.increment) {
                column.autoIncrement = true;
              }

              // Default value - PROPERLY HANDLED
              if (field.dbdefault !== undefined && field.dbdefault !== null) {
                const parsed = parseDefaultValue(field.dbdefault);
                column.defaultValue = parsed.value;
                column.defaultValueType = parsed.type;
              }

              // String length (e.g., VARCHAR(255))
              if (field.type.args && field.type.args.length > 0) {
                column.length = field.type.args[0];
              }

              // Precision and scale for numeric types (e.g., DECIMAL(10,2))
              if (field.type.args && field.type.args.length === 2) {
                column.precision = field.type.args[0];
                column.scale = field.type.args[1];
              }

              // Note/Comment
              if (field.note) {
                column.note =
                  typeof field.note === "string"
                    ? field.note
                    : field.note.value || "";
              }

              // Enum values
              if (field.type.values && Array.isArray(field.type.values)) {
                column.enumValues = field.type.values;
              }

              return column;
            });

            return {
              id: table.name,
              name: table.name,
              columns,
              position: {
                x: 100 + (index % 3) * 350,
                y: 100 + Math.floor(index / 3) * 250,
              },
            };
          })
        : [];

      // Convert tables to XYFlow nodes
      const nodes: Node[] = tables.map((table) => ({
        id: table.id,
        type: "table",
        position: table.position || { x: 0, y: 0 },
        data: {
          label: table.name,
          columns: table.columns,
        },
        draggable: true,
        resizable: true,
        selectable: true,
      }));

      // Extract relationships (foreign keys) as edges
      const edges: Edge[] = schema.refs
        ? (schema.refs
            .map((ref: any, index: number) => {
              // Validate reference structure
              if (!ref.endpoints || ref.endpoints.length !== 2) {
                // console.warn("Invalid reference structure:", ref);
                return null;
              }

              const sourceEndpoint = ref.endpoints[0];
              const targetEndpoint = ref.endpoints[1];

              if (!sourceEndpoint.tableName || !targetEndpoint.tableName) {
                // console.warn("Missing table names in reference:", ref);
                return null;
              }

              const edge: Edge = {
                id: `edge-${index}`,
                source: sourceEndpoint.tableName,
                target: targetEndpoint.tableName,
                label: `${sourceEndpoint.fieldNames?.[0] || "?"} → ${
                  targetEndpoint.fieldNames?.[0] || "?"
                }`,
                type: "smoothstep",
                animated: true,
              };

              // Add foreign key constraint info to source column
              const sourceTable = tables.find(
                (t) => t.id === sourceEndpoint.tableName
              );

              if (sourceTable && sourceEndpoint.fieldNames?.[0]) {
                const sourceColumn = sourceTable.columns.find(
                  (c) => c.name === sourceEndpoint.fieldNames[0]
                );

                if (sourceColumn && targetEndpoint.fieldNames?.[0]) {
                  sourceColumn.foreignKey = {
                    table: targetEndpoint.tableName,
                    column: targetEndpoint.fieldNames[0],
                    onDelete: ref.onDelete || undefined,
                    onUpdate: ref.onUpdate || undefined,
                  };
                }
              }

              return edge;
            })
            .filter(Boolean) as Edge[])
        : [];

      // Update state
      set({
        dbml,
        sql,
        tables,
        nodes,
        edges,
        isUpdating: false,
      });
    } catch (error: unknown) {
      let errorMessage = "Failed to parse DBML";

      // Extract error message from DBML parser
      if (
        error &&
        typeof error === "object" &&
        "diags" in error &&
        Array.isArray((error as { diags: unknown[] }).diags) &&
        (error as { diags: unknown[] }).diags.length > 0
      ) {
        const firstDiag = (error as { diags: Array<{ message?: string }> })
          .diags[0];
        errorMessage = firstDiag.message || errorMessage;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      // console.error("DBML Parse Error:", errorMessage, error);

      set({ isUpdating: false });
      throw new Error(errorMessage);
    }
  },
}));
