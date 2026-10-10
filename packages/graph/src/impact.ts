import type { CanonicalSchema } from "@enops/atlas-schema";
import type { Edge, SchemaGraph } from "./types";
import { tableKey } from "./types";

export type ChangeRequest =
  | { kind: "remove-table"; schema: string; table: string }
  | { kind: "remove-column"; schema: string; table: string; column: string }
  | { kind: "remove-enum"; enumName: string; schema?: string };

export type Severity = "safe" | "breaking";

export interface AffectedColumnRef {
  column: string;
  reason: string;
  table: string; // tableKey
}

export interface AffectedConstraintRef {
  kind: "check" | "foreign-key" | "index" | "primary-key" | "unique";
  name: string | null;
  reason: string;
  table: string;
}

export interface ImpactReport {
  affectedColumns: AffectedColumnRef[];
  affectedConstraints: AffectedConstraintRef[];
  affectedRelationships: Edge[];
  affectedTables: string[]; // tableKeys
  change: ChangeRequest;
  destructive: boolean;
  notes: string[];
  severity: Severity;
}

export interface ImpactError {
  code: "not-found" | "ambiguous";
  message: string;
}

export type ImpactResult =
  | { ok: true; report: ImpactReport }
  | { ok: false; error: ImpactError };

function findEnumUsages(
  schema: CanonicalSchema,
  enumName: string,
  enumSchema: string
): AffectedColumnRef[] {
  const usages: AffectedColumnRef[] = [];
  for (const table of schema.tables) {
    const key = tableKey(table.schema, table.name);
    for (const col of table.columns) {
      if (
        col.type === "enum" &&
        col.enumName === enumName &&
        (col.enumSchema ?? "public") === enumSchema
      ) {
        usages.push({
          column: col.name,
          reason: `column type references enum "${enumName}"`,
          table: key,
        });
      }
    }
  }
  return usages;
}

function analyzeRemoveTable(
  graph: SchemaGraph,
  schema: string,
  table: string
): ImpactResult {
  const key = tableKey(schema, table);
  if (!graph.nodes.has(key)) {
    return {
      error: { code: "not-found", message: `Table "${key}" does not exist.` },
      ok: false,
    };
  }

  const outgoing = graph.adjacency.get(key) ?? [];
  const incoming = graph.reverseAdjacency.get(key) ?? [];
  const affectedRelationships = [...outgoing, ...incoming];

  const affectedTables = new Set<string>();
  for (const e of affectedRelationships)
    affectedTables.add(e.from === key ? e.to : e.from);

  const notes: string[] = [];
  for (const e of outgoing) {
    notes.push(
      `"${key}" references "${e.to}" via ${e.fk.columns.join(",")} → ${e.fk.refColumns.join(",")}; this relationship would be removed.`
    );
  }
  for (const e of incoming) {
    const cascadeNote =
      e.fk.onDelete === "cascade"
        ? " (this FK has ON DELETE CASCADE — rows would be auto-deleted, not orphaned)"
        : "";
    notes.push(
      `"${e.from}" (via ${e.fk.columns.join(",")}) references "${key}"; this FK would become dangling${cascadeNote}.`
    );
  }
  if (affectedRelationships.length === 0)
    notes.push(
      `No other table references "${key}", but dropping it still deletes stored data and can break application code.`
    );

  const ownTable = graph.nodes.get(key)!.table;
  const ownConstraints: AffectedConstraintRef[] = [
    ...(ownTable.primaryKey
      ? [
          {
            kind: "primary-key" as const,
            name: ownTable.primaryKey.name ?? null,
            reason: "constraint belongs to the removed table",
            table: key,
          },
        ]
      : []),
    ...ownTable.uniqueConstraints.map((constraint) => ({
      kind: "unique" as const,
      name: constraint.name,
      reason: "constraint belongs to the removed table",
      table: key,
    })),
    ...ownTable.indexes.map((index) => ({
      kind: "index" as const,
      name: index.name,
      reason: "index belongs to the removed table",
      table: key,
    })),
    ...(ownTable.checks ?? []).map((check) => ({
      kind: "check" as const,
      name: check.name,
      reason: "constraint belongs to the removed table",
      table: key,
    })),
    ...ownTable.columns.flatMap((column) => [
      ...(column.unique
        ? [
            {
              kind: "unique" as const,
              name: null,
              reason: `unique constraint belongs to removed column ${column.name}`,
              table: key,
            },
          ]
        : []),
      ...(column.checks ?? []).map((check) => ({
        kind: "check" as const,
        name: check.name,
        reason: `constraint belongs to removed column ${column.name}`,
        table: key,
      })),
    ]),
  ];

  return {
    ok: true,
    report: {
      affectedColumns: [],
      affectedConstraints: [
        ...ownConstraints,
        ...affectedRelationships.map((edge) => ({
          kind: "foreign-key" as const,
          name: edge.fk.name ?? null,
          reason: `relationship ${edge.from} -> ${edge.to} would be removed`,
          table: edge.from,
        })),
      ],
      affectedRelationships,
      affectedTables: [...affectedTables],
      change: { kind: "remove-table", schema, table },
      destructive: true,
      notes,
      severity: "breaking",
    },
  };
}

function analyzeRemoveColumn(
  schema: CanonicalSchema,
  graph: SchemaGraph,
  schemaName: string,
  tableName: string,
  columnName: string
): ImpactResult {
  const key = tableKey(schemaName, tableName);
  const table = schema.tables.find(
    (t) => t.schema === schemaName && t.name === tableName
  );
  if (!table)
    return {
      error: { code: "not-found", message: `Table "${key}" does not exist.` },
      ok: false,
    };

  const column = table.columns.find((c) => c.name === columnName);
  if (!column) {
    return {
      error: {
        code: "not-found",
        message: `Column "${columnName}" does not exist on "${key}".`,
      },
      ok: false,
    };
  }

  const outgoing = (graph.adjacency.get(key) ?? []).filter((e) =>
    e.fk.columns.includes(columnName)
  );
  const incoming = (graph.reverseAdjacency.get(key) ?? []).filter((e) =>
    e.fk.refColumns.includes(columnName)
  );
  const affectedRelationships = [...outgoing, ...incoming];
  const expressionMentionsColumn = (expression: string) => {
    const escaped = columnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Za-z0-9_$])${escaped}([^A-Za-z0-9_$]|$)`).test(
      expression
    );
  };
  const affectedConstraints: AffectedConstraintRef[] = [];
  if (table.primaryKey?.columns.includes(columnName))
    affectedConstraints.push({
      kind: "primary-key",
      name: table.primaryKey.name ?? null,
      reason: "column participates in the primary key",
      table: key,
    });
  if (column.unique)
    affectedConstraints.push({
      kind: "unique",
      name: null,
      reason: "column has a unique constraint",
      table: key,
    });
  for (const unique of table.uniqueConstraints)
    if (
      unique.columns.includes(columnName) ||
      unique.elements?.some(
        (element) => element.kind === "column" && element.value === columnName
      )
    )
      affectedConstraints.push({
        kind: "unique",
        name: unique.name,
        reason: "column participates in a unique constraint",
        table: key,
      });
  for (const index of table.indexes)
    if (
      index.columns.includes(columnName) ||
      index.elements?.some((element) =>
        element.kind === "column"
          ? element.value === columnName
          : expressionMentionsColumn(element.value)
      )
    )
      affectedConstraints.push({
        kind: "index",
        name: index.name,
        reason: "column participates in an index or index expression",
        table: key,
      });
  for (const check of column.checks ?? [])
    affectedConstraints.push({
      kind: "check",
      name: check.name,
      reason: "column owns this check constraint",
      table: key,
    });
  for (const check of table.checks ?? [])
    if (expressionMentionsColumn(check.expression))
      affectedConstraints.push({
        kind: "check",
        name: check.name,
        reason: "table check references the column",
        table: key,
      });
  for (const edge of affectedRelationships)
    affectedConstraints.push({
      kind: "foreign-key",
      name: edge.fk.name ?? null,
      reason: `relationship ${edge.from} -> ${edge.to} references the column`,
      table: edge.from,
    });

  const affectedTables = new Set<string>();
  for (const e of affectedRelationships)
    affectedTables.add(e.from === key ? e.to : e.from);

  const notes: string[] = [];
  if (column.primaryKey)
    notes.push(
      `"${key}.${columnName}" is (part of) the primary key — removing it affects row identity and every relationship.`
    );
  for (const e of outgoing)
    notes.push(
      `"${key}.${columnName}" is a foreign key to "${e.to}"; removing it deletes this relationship.`
    );
  for (const e of incoming)
    notes.push(
      `"${e.from}" references "${key}.${columnName}"; removing the column breaks that FK.`
    );
  for (const constraint of affectedConstraints)
    if (constraint.kind !== "foreign-key")
      notes.push(
        `${constraint.kind} ${constraint.name ? `"${constraint.name}" ` : ""}on "${constraint.table}" is affected: ${constraint.reason}.`
      );
  if (affectedRelationships.length === 0 && affectedConstraints.length === 0) {
    notes.push(
      `"${key}.${columnName}" is not referenced by known constraints, but removal still deletes stored data and can break application code.`
    );
  }

  return {
    ok: true,
    report: {
      affectedColumns: [
        { column: columnName, reason: "target of removal", table: key },
      ],
      affectedConstraints,
      affectedRelationships,
      affectedTables: [...affectedTables],
      change: {
        column: columnName,
        kind: "remove-column",
        schema: schemaName,
        table: tableName,
      },
      destructive: true,
      notes,
      severity: "breaking",
    },
  };
}

function analyzeRemoveEnum(
  schema: CanonicalSchema,
  enumName: string,
  namespace?: string
): ImpactResult {
  const matches = schema.enums.filter(
    (e) => e.name === enumName && (!namespace || e.schema === namespace)
  );
  if (matches.length > 1)
    return {
      error: {
        code: "ambiguous",
        message: `Enum ${enumName} exists in multiple schemas; specify its namespace`,
      },
      ok: false,
    };
  if (!matches.length) {
    return {
      error: {
        code: "not-found",
        message: `Enum "${enumName}" does not exist.`,
      },
      ok: false,
    };
  }

  const affectedColumns = findEnumUsages(schema, enumName, matches[0]!.schema);
  const affectedTables = [...new Set(affectedColumns.map((c) => c.table))];
  const qualifiedEnum = `${matches[0]!.schema}.${enumName}`;
  const notes = affectedColumns.map(
    (c) =>
      `"${c.table}.${c.column}" uses enum "${qualifiedEnum}" — its type would become invalid.`
  );
  if (affectedColumns.length === 0)
    notes.push(
      `No column references enum "${enumName}"; removal is structurally safe.`
    );

  return {
    ok: true,
    report: {
      affectedColumns,
      affectedConstraints: [],
      affectedRelationships: [],
      affectedTables,
      change: { enumName, kind: "remove-enum", schema: matches[0]!.schema },
      destructive: true,
      notes,
      severity: affectedColumns.length > 0 ? "breaking" : "safe",
    },
  };
}

/** Computes the exact structural impact of a removal. Deterministic — no LLM. */
export function analyzeImpact(
  schema: CanonicalSchema,
  graph: SchemaGraph,
  change: ChangeRequest
): ImpactResult {
  switch (change.kind) {
    case "remove-table":
      return analyzeRemoveTable(graph, change.schema, change.table);
    case "remove-column":
      return analyzeRemoveColumn(
        schema,
        graph,
        change.schema,
        change.table,
        change.column
      );
    case "remove-enum":
      return analyzeRemoveEnum(schema, change.enumName, change.schema);
  }
}
