import { generateFromCanonical } from "@enops/atlas-generators";
import type {
  CanonicalColumn,
  CanonicalEnum,
  CanonicalForeignKey,
  CanonicalTable,
} from "@enops/atlas-schema";
import { analyzeDbml, tableKey } from "./atlas";

export interface ForeignKeyMeta {
  column: string;
  onDelete?: string;
  onUpdate?: string;
  relation?: string;
  schema: string;
  table: string;
}

export interface Column {
  autoIncrement?: boolean;
  check?: string;
  comment?: string;
  defaultValue?: string | number | boolean | null;
  defaultValueType?: "expression" | "string" | "number" | "boolean" | "null";
  enumValues?: string[];
  foreignKeys?: ForeignKeyMeta[];
  indexed?: boolean;
  indexType?: "btree" | "hash" | "gist" | "gin" | "brin" | "spgist";
  length?: number;
  name: string;
  note?: string;
  nullable?: boolean;
  precision?: number;
  primaryKey?: boolean;
  scale?: number;
  type: string;
  typeDetail?: string;
  unique?: boolean;
  unsigned?: boolean;
}

export interface Table {
  alias?: string;
  columns: Column[];
  displayLabel: string;
  name: string;
  referenceName: string;
  schema: string;
}

export interface RelationshipEndpoint {
  column: string;
  relation?: string;
  schema: string;
  table: string;
}

export interface Relationship {
  child: RelationshipEndpoint;
  id: string;
  onDelete?: string;
  onUpdate?: string;
  parent: RelationshipEndpoint;
}

export interface TransformWarning {
  context?: string;
  message: string;
}

export interface TransformResult {
  relationships: Relationship[];
  sql: string;
  tables: Table[];
  warnings: TransformWarning[];
}

const MAX_TABLES = 500;
const MAX_COLUMNS_PER_TABLE = 200;
const MAX_RELATIONSHIPS = 2000;

const INDEX_TYPES = new Set<string>([
  "brin",
  "btree",
  "gin",
  "gist",
  "hash",
  "spgist",
]);

const toIndexType = (type: string | null | undefined): Column["indexType"] =>
  type && INDEX_TYPES.has(type) ? (type as Column["indexType"]) : undefined;

/** "1" / "*" labels drawn on each end of a relationship edge. */
const RELATION_LABELS: Record<
  CanonicalForeignKey["cardinality"],
  { child: string; parent: string }
> = {
  "many-to-many": { child: "*", parent: "*" },
  "one-to-many": { child: "*", parent: "1" },
  "one-to-one": { child: "1", parent: "1" },
};

const refAction = (action: CanonicalForeignKey["onDelete"]) =>
  action === "none" ? undefined : action;

/** The type as written in the DBML, without its arguments or schema prefix. */
const displayType = (column: CanonicalColumn): string => {
  const native = column.nativeType?.name ?? column.type;
  const base = native.replace(/\(.*\)$/, "").trim();
  return base.split(".").pop() || base;
};

const findEnumValues = (
  enums: CanonicalEnum[],
  column: CanonicalColumn,
  tableSchema: string
): string[] | undefined => {
  if (!column.enumName) return undefined;
  const schema = column.enumSchema ?? tableSchema;
  const found =
    enums.find((e) => e.name === column.enumName && e.schema === schema) ??
    enums.find((e) => e.name === column.enumName && e.schema === "public");
  return found?.values;
};

const buildColumns = (
  table: CanonicalTable,
  enums: CanonicalEnum[],
  warnings: TransformWarning[],
  displayLabel: string
): Column[] => {
  const columns: Column[] = table.columns.map((column) => {
    const mapped: Column = {
      autoIncrement: column.autoIncrement,
      foreignKeys: [],
      name: column.name,
      nullable: column.nullable,
      primaryKey: column.primaryKey,
      type: displayType(column),
      unique: column.unique,
    };

    if (column.nativeType?.args) mapped.typeDetail = column.nativeType.args;
    if (column.length !== undefined) mapped.length = column.length;
    if (column.precision) {
      mapped.precision = column.precision[0];
      mapped.scale = column.precision[1];
    }
    if (column.default) {
      mapped.defaultValue = column.default.value;
      mapped.defaultValueType = column.default.type;
    }
    if (column.note) mapped.note = column.note;
    if (column.checks?.[0]?.expression) {
      mapped.check = column.checks[0].expression;
    }

    const enumValues = findEnumValues(enums, column, table.schema);
    if (enumValues) mapped.enumValues = enumValues;

    return mapped;
  });

  const markIndexed = (
    names: string[],
    apply: (column: Column) => void
  ): void => {
    for (const columnName of names) {
      const column = columns.find((candidate) => candidate.name === columnName);
      if (!column) {
        warnings.push({
          context: displayLabel,
          message: `Index references unknown column "${columnName}"`,
        });
        continue;
      }
      column.indexed = true;
      apply(column);
    }
  };

  for (const index of table.indexes) {
    markIndexed(index.columns, (column) => {
      column.indexType = toIndexType(index.type) ?? column.indexType;
    });
  }
  for (const unique of table.uniqueConstraints) {
    markIndexed(unique.columns, (column) => {
      column.unique = true;
      column.indexType = toIndexType(unique.type) ?? column.indexType;
    });
  }
  if (table.primaryKey?.source === "index") {
    markIndexed(table.primaryKey.columns, (column) => {
      column.primaryKey = true;
      column.unique = true;
      column.nullable = false;
    });
  }

  return columns;
};

export function transformDbml(dbml: string): TransformResult {
  if (!dbml || dbml.trim() === "") {
    throw new Error("DBML string cannot be empty");
  }

  const { canonical, parsed } = analyzeDbml(dbml);
  // Table aliases only exist on the parsed schema, not the canonical one.
  const aliases = new Map<string, string>();
  for (const parsedTable of parsed.tables.values()) {
    if (parsedTable.alias) {
      aliases.set(
        tableKey(parsedTable.schema, parsedTable.name),
        parsedTable.alias
      );
    }
  }

  if (canonical.tables.length === 0) {
    throw new Error("No schema found in DBML");
  }

  if (canonical.tables.length > MAX_TABLES) {
    throw new Error(
      `Schema exceeds maximum table limit of ${MAX_TABLES}. Found ${canonical.tables.length} tables.`
    );
  }

  const warnings: TransformWarning[] = [];
  const tables: Table[] = [];
  const tableRegistry = new Map<string, Table>();

  for (const table of canonical.tables) {
    if (table.columns.length === 0) {
      warnings.push({
        context: table.schema,
        message: `Table "${table.name}" has no columns`,
      });
      continue;
    }

    if (table.columns.length > MAX_COLUMNS_PER_TABLE) {
      throw new Error(
        `Table "${table.name}" exceeds maximum column limit of ${MAX_COLUMNS_PER_TABLE}. Found ${table.columns.length} columns.`
      );
    }

    const displayLabel =
      table.schema === "public" ? table.name : `${table.schema}.${table.name}`;
    const alias = aliases.get(tableKey(table.schema, table.name));

    const tableEntry: Table = {
      alias: alias || undefined,
      columns: buildColumns(table, canonical.enums, warnings, displayLabel),
      displayLabel,
      name: table.name,
      referenceName: alias || table.name,
      schema: table.schema,
    };

    tables.push(tableEntry);
    tableRegistry.set(tableKey(table.schema, table.name), tableEntry);
  }

  const relationships: Relationship[] = [];
  const circularRefCheck = new Set<string>();
  let refIndex = 0;

  for (const table of canonical.tables) {
    for (const fk of table.foreignKeys) {
      const currentRef = refIndex;
      refIndex += 1;
      const childTable = tableRegistry.get(tableKey(table.schema, table.name));
      const parentTable = tableRegistry.get(
        tableKey(fk.refTable.schema, fk.refTable.table)
      );

      if (!(childTable && parentTable)) {
        warnings.push({
          context: `${table.schema}.${table.name} -> ${fk.refTable.schema}.${fk.refTable.table}`,
          message: "Unable to resolve reference endpoints",
        });
        continue;
      }

      const labels = RELATION_LABELS[fk.cardinality];
      const onDelete = refAction(fk.onDelete);
      const onUpdate = refAction(fk.onUpdate);
      const pairCount = Math.max(fk.columns.length, fk.refColumns.length);

      for (let index = 0; index < pairCount; index += 1) {
        const childField = fk.columns[index] ?? fk.columns[0];
        const parentField = fk.refColumns[index] ?? fk.refColumns[0];

        if (!(childField && parentField)) {
          warnings.push({
            context: `${parentTable.displayLabel} ↔ ${childTable.displayLabel}`,
            message: "Reference endpoint missing column name",
          });
          continue;
        }

        const relationshipId = `${fk.refTable.schema}.${fk.refTable.table}.${parentField}->${table.schema}.${table.name}.${childField}:${currentRef}:${index}`;

        const reverseId = `${table.schema}.${table.name}.${childField}->${fk.refTable.schema}.${fk.refTable.table}.${parentField}`;
        if (circularRefCheck.has(reverseId)) {
          warnings.push({
            context: `${parentTable.displayLabel}.${parentField} ↔ ${childTable.displayLabel}.${childField}`,
            message: "Potential circular reference detected",
          });
        }
        circularRefCheck.add(relationshipId);

        relationships.push({
          child: {
            column: childField,
            relation: labels.child,
            schema: table.schema,
            table: table.name,
          },
          id: relationshipId,
          onDelete,
          onUpdate,
          parent: {
            column: parentField,
            relation: labels.parent,
            schema: fk.refTable.schema,
            table: fk.refTable.table,
          },
        });

        if (relationships.length > MAX_RELATIONSHIPS) {
          throw new Error(
            `Schema exceeds maximum relationship limit of ${MAX_RELATIONSHIPS}. Found ${relationships.length} relationships.`
          );
        }

        const childColumn = childTable.columns.find(
          (column) => column.name === childField
        );
        if (childColumn) {
          childColumn.foreignKeys?.push({
            column: parentField,
            onDelete,
            onUpdate,
            relation: labels.parent,
            schema: fk.refTable.schema,
            table: fk.refTable.table,
          });
        } else {
          warnings.push({
            context: childTable.displayLabel,
            message: `Unable to attach foreign key metadata for ${childField}`,
          });
        }
      }
    }
  }

  const generated = generateFromCanonical(canonical, { format: "sql" });
  const sql = generated.ok ? generated.code : "";
  if (!generated.ok) {
    warnings.push({
      context: "SQL export",
      message: generated.diagnostics.map((issue) => issue.message).join("; "),
    });
  }

  return {
    relationships,
    sql,
    tables,
    warnings,
  };
}
