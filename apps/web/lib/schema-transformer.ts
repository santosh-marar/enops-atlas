import { Parser, ModelExporter } from "@dbml/core";

export interface ForeignKeyMeta {
  schema: string;
  table: string;
  column: string;
  relation?: string;
  onDelete?: string;
  onUpdate?: string;
}

export interface Column {
  name: string;
  type: string;
  typeDetail?: string;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  autoIncrement?: boolean;
  defaultValue?: string | number | boolean | null;
  defaultValueType?: "expression" | "string" | "number" | "boolean" | "null";
  indexed?: boolean;
  indexType?: "btree" | "hash" | "gist" | "gin" | "brin";
  length?: number;
  precision?: number;
  scale?: number;
  unsigned?: boolean;
  comment?: string;
  note?: string;
  check?: string;
  enumValues?: string[];
  foreignKeys?: ForeignKeyMeta[];
}

export interface Table {
  schema: string;
  name: string;
  alias?: string;
  referenceName: string;
  displayLabel: string;
  columns: Column[];
}

export interface RelationshipEndpoint {
  schema: string;
  table: string;
  column: string;
  relation?: string;
}

export interface Relationship {
  id: string;
  parent: RelationshipEndpoint;
  child: RelationshipEndpoint;
  onDelete?: string;
  onUpdate?: string;
}

export interface TransformWarning {
  message: string;
  context?: string;
}

export interface TransformResult {
  sql: string;
  tables: Table[];
  relationships: Relationship[];
  warnings: TransformWarning[];
}

const TYPE_SHORTHANDS: Record<string, string> = {
  integer: "int",
  int4: "int",
  bigint: "bigint",
  bigserial: "bigserial",
  serial: "serial",
  smallint: "smallint",
  varchar: "varchar",
  "character varying": "varchar",
  text: "text",
  timestamp: "timestamp",
  timestamptz: "timestamptz",
  datetime: "datetime",
  bool: "bool",
  boolean: "bool",
  numeric: "numeric",
  decimal: "decimal",
  double: "double",
};

interface DbmlDiagnostic {
  message?: string;
}

interface DbmlError {
  diags: DbmlDiagnostic[];
}

const extractErrorMessage = (error: unknown): string => {
  if (
    error &&
    typeof error === "object" &&
    "diags" in error &&
    Array.isArray((error as DbmlError).diags)
  ) {
    const diags = (error as DbmlError).diags;
    if (diags.length > 0) {
      return diags[0]?.message ?? "Failed to parse DBML";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to parse DBML";
};

const normalizeSchemaName = (schemaName?: string | null) =>
  schemaName && schemaName.trim().length > 0 ? schemaName : "public";

const makeTableKey = (schemaName: string, tableName: string) =>
  `${schemaName}::${tableName}`;

const makeColumnKey = (
  schemaName: string,
  tableName: string,
  columnName: string
) => `${schemaName}::${tableName}::${columnName}`;

interface DbmlFieldType {
  type_name?: string;
  args?: string | string[] | number[];
  values?: string[];
}

interface DbmlField {
  name: string;
  type?: DbmlFieldType;
  not_null?: boolean;
  pk?: boolean;
  unique?: boolean;
  increment?: boolean;
  dbdefault?: unknown;
  note?: string | { value?: string };
}

const formatColumnType = (
  field: DbmlField
): { type: string; detail?: string } => {
  if (!field.type) {
    return { type: "unknown" };
  }

  const rawType = field.type.type_name ?? "unknown";
  const match = /^([A-Za-z0-9_\\.]+)(?:\((.*)\))?$/.exec(rawType);
  const baseRaw = match ? match[1] : rawType;
  const argsRaw = match ? match[2] : undefined;

  const baseParts = baseRaw.split(".");
  const rawBaseType = baseParts[baseParts.length - 1] || baseRaw;
  const baseLower = rawBaseType.toLowerCase();
  const displayType = TYPE_SHORTHANDS[baseLower] || rawBaseType;

  let detail = argsRaw;
  const args = field.type.args;
  if (!detail && Array.isArray(args) && args.length) {
    detail = args.join(", ");
  } else if (!detail && typeof args === "string") {
    detail = args;
  }

  return detail
    ? { type: displayType, detail: detail.toString() }
    : { type: displayType };
};

interface DbmlDefaultValue {
  type?: string;
  value?: unknown;
}

const parseDefaultValue = (
  dbdefault: unknown
): {
  value: string | number | boolean | null;
  type: "expression" | "string" | "number" | "boolean" | "null";
} => {
  if (dbdefault === null || dbdefault === undefined) {
    return { value: null, type: "null" };
  }

  if (typeof dbdefault === "object" && dbdefault !== null && "type" in dbdefault) {
    const defaultObj = dbdefault as DbmlDefaultValue;
    const { type, value } = defaultObj;
    switch (type) {
      case "number":
        return { value: Number(value), type: "number" };
      case "string":
        return { value: String(value), type: "string" };
      case "boolean":
        return { value: Boolean(value), type: "boolean" };
      case "expression":
        return { value: String(value), type: "expression" };
      default:
        return { value: String(value), type: "string" };
    }
  }

  if (typeof dbdefault === "number") {
    return { value: dbdefault, type: "number" };
  }
  if (typeof dbdefault === "boolean") {
    return { value: dbdefault, type: "boolean" };
  }
  if (typeof dbdefault === "string") {
    const isExpression = /\(|\)|now|current|uuid|gen_random/i.test(dbdefault);
    return { value: dbdefault, type: isExpression ? "expression" : "string" };
  }

  return { value: String(dbdefault), type: "string" };
};

interface TableRegistryEntry {
  schema: string;
  actualName: string;
  alias?: string;
  referenceName: string;
  displayLabel: string;
  columns: Column[];
}

interface ResolvedEndpoint {
  entry: TableRegistryEntry;
  schemaName: string;
}

interface DbmlEndpoint {
  schemaName?: string;
  tableName: string;
  fieldNames?: string[];
  relation?: string;
}

interface DbmlTable {
  name: string;
  alias?: string;
  fields: DbmlField[];
  indexes?: DbmlIndex[];
}

interface DbmlIndex {
  pk?: boolean | string;
  unique?: boolean;
  type?: string;
  columns?: Array<{ value?: string | { name?: string } }>;
}

interface DbmlRef {
  endpoints?: DbmlEndpoint[];
  onDelete?: string;
  onUpdate?: string;
}

interface DbmlEnum {
  name?: string;
  values?: Array<{ name?: string } | string>;
}

interface DbmlSchema {
  name?: string;
  tables?: DbmlTable[];
  refs?: DbmlRef[];
  enums?: DbmlEnum[];
}

interface DbmlModel {
  schemas?: DbmlSchema[];
}

const resolveTableEntry = (
  tableRegistry: Map<string, TableRegistryEntry>,
  endpoint: DbmlEndpoint,
  fallbackSchema: string
): ResolvedEndpoint | null => {
  if (!endpoint.tableName) {
    return null;
  }

  const candidates = new Set<string>();

  if (endpoint.schemaName) {
    candidates.add(normalizeSchemaName(endpoint.schemaName));
  }

  candidates.add(normalizeSchemaName(fallbackSchema));
  candidates.add("public");

  for (const candidate of candidates) {
    const registryEntry = tableRegistry.get(
      makeTableKey(candidate, endpoint.tableName)
    );
    if (registryEntry) {
      return { entry: registryEntry, schemaName: candidate };
    }
  }

  for (const [, registryEntry] of tableRegistry.entries()) {
    if (
      registryEntry.actualName === endpoint.tableName ||
      registryEntry.alias === endpoint.tableName
    ) {
      return { entry: registryEntry, schemaName: registryEntry.schema };
    }
  }

  return null;
};

const MAX_TABLES = 500;
const MAX_COLUMNS_PER_TABLE = 200;
const MAX_RELATIONSHIPS = 2000;

export function transformDbml(dbml: string): TransformResult {
  if (!dbml || dbml.trim() === "") {
    throw new Error("DBML string cannot be empty");
  }

  const parser = new Parser();
  let model: unknown;

  try {
    model = parser.parse(dbml, "dbml");
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }

  let sql: string;

  try {
    sql = ModelExporter.export(model as any, "postgres", false);
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }

  const dbmlModel = model as DbmlModel;
  const schemas = dbmlModel.schemas ?? [];

  if (!schemas.length) {
    throw new Error("No schema found in DBML");
  }

  // Validate schema limits
  const totalTables = schemas.reduce(
    (acc, schema) => acc + (schema.tables?.length ?? 0),
    0
  );
  if (totalTables > MAX_TABLES) {
    throw new Error(
      `Schema exceeds maximum table limit of ${MAX_TABLES}. Found ${totalTables} tables.`
    );
  }

  const tables: Table[] = [];
  const tableRegistry = new Map<string, TableRegistryEntry>();
  const columnRegistry = new Map<string, Column>();
  const warnings: TransformWarning[] = [];

  // enum registry for lookup
  const enumRegistry = new Map<string, string[]>();
  schemas.forEach((schema) => {
    const schemaName = normalizeSchemaName(schema.name);
    (schema.enums || []).forEach((enumDef) => {
      if (enumDef.name && enumDef.values) {
        const enumKey = `${schemaName}.${enumDef.name}`;
        const enumValues = enumDef.values.map((v) =>
          typeof v === 'object' && v.name ? v.name : String(v)
        );
        enumRegistry.set(enumKey, enumValues);
        if (schemaName === "public") {
          enumRegistry.set(enumDef.name, enumValues);
        }
      }
    });
  });

  schemas.forEach((schema) => {
    const schemaName = normalizeSchemaName(schema.name);
    schema.tables?.forEach((table) => {
      if (!table.name) {
        warnings.push({
          message: "Table missing name",
          context: `schema ${schemaName}`,
        });
        return;
      }

      if (!table.fields || table.fields.length === 0) {
        warnings.push({
          message: `Table "${table.name}" has no columns`,
          context: schemaName,
        });
        return;
      }

      if (table.fields.length > MAX_COLUMNS_PER_TABLE) {
        throw new Error(
          `Table "${table.name}" exceeds maximum column limit of ${MAX_COLUMNS_PER_TABLE}. Found ${table.fields.length} columns.`
        );
      }

      const referenceName = table.alias || table.name;

      const displayLabel =
        schemaName === "public" ? table.name : `${schemaName}.${table.name}`;

      const columns: Column[] = table.fields.map((field) => {
        const { type, detail } = formatColumnType(field);

        const column: Column = {
          name: field.name,
          type,
          nullable: !field.not_null,
          primaryKey: Boolean(field.pk),
          unique: Boolean(field.unique),
          autoIncrement: Boolean(field.increment),
          foreignKeys: [],
        };

        if (detail) {
          column.typeDetail = detail;
        }

        if (field.dbdefault !== undefined && field.dbdefault !== null) {
          const parsed = parseDefaultValue(field.dbdefault);
          column.defaultValue = parsed.value;
          column.defaultValueType = parsed.type;
        }

        if (Array.isArray(field.type?.args)) {
          if (field.type.args.length === 1) {
            const arg = field.type.args[0];
            column.length = typeof arg === "number" ? arg : parseInt(String(arg), 10);
          }
          if (field.type.args.length === 2) {
            const arg0 = field.type.args[0];
            const arg1 = field.type.args[1];
            column.precision = typeof arg0 === "number" ? arg0 : parseInt(String(arg0), 10);
            column.scale = typeof arg1 === "number" ? arg1 : parseInt(String(arg1), 10);
          }
        }

        if (field.note) {
          column.note =
            typeof field.note === "string"
              ? field.note
              : field.note.value || "";
        }

        // Check for inline enum values
        if (field.type?.values && Array.isArray(field.type.values)) {
          column.enumValues = field.type.values;
        }
        // Check for enum type reference (e.g., "ecommerce.products_status")
        else if (field.type?.type_name) {
          const enumTypeName = field.type.type_name;
          // Try with current schema prefix first
          const fullEnumName = `${schemaName}.${enumTypeName}`;
          let enumValues = enumRegistry.get(fullEnumName);

          // If not found, try without schema (for cross-schema references)
          if (!enumValues) {
            enumValues = enumRegistry.get(enumTypeName);
          }

          if (enumValues) {
            column.enumValues = enumValues;
          }
        }

        return column;
      });

      table.indexes?.forEach((index) => {
        const isPrimaryKey = Boolean(index.pk);
        const isUniqueIndex = Boolean(index.unique);

        (index.columns || []).forEach((idxCol) => {
          let columnName: string | undefined;

          if (typeof idxCol.value === "string") {
            columnName = idxCol.value;
          } else if (typeof idxCol.value === "object" && idxCol.value !== null) {
            columnName = idxCol.value.name;
          }

          if (!columnName) {
            warnings.push({
              message: "Index column missing name",
              context: `${displayLabel} index`,
            });
            return;
          }

          const column = columns.find((col) => col.name === columnName);
          if (!column) {
            warnings.push({
              message: `Index references unknown column "${columnName}"`,
              context: displayLabel,
            });
            return;
          }

          column.indexed = true;

          if (index.type && typeof index.type === "string") {
            const validTypes = ["btree", "hash", "gist", "gin", "brin"];
            if (validTypes.includes(index.type)) {
              column.indexType = index.type as "btree" | "hash" | "gist" | "gin" | "brin";
            }
          }

          if (isPrimaryKey) {
            column.primaryKey = true;
            column.unique = true;
            column.nullable = false;
          }

          if (isUniqueIndex) {
            column.unique = true;
          }
        });
      });

      const tableEntry: Table = {
        schema: schemaName,
        name: table.name,
        alias: table.alias || undefined,
        referenceName,
        displayLabel,
        columns,
      };

      tables.push(tableEntry);

      const registryEntry: TableRegistryEntry = {
        schema: schemaName,
        actualName: table.name,
        alias: table.alias || undefined,
        referenceName,
        displayLabel,
        columns,
      };

      const referenceNames = new Set<string>([table.name]);
      if (table.alias) {
        referenceNames.add(table.alias);
      }

      referenceNames.forEach((name) => {
        tableRegistry.set(makeTableKey(schemaName, name), registryEntry);
        columns.forEach((column) => {
          columnRegistry.set(
            makeColumnKey(schemaName, name, column.name),
            column
          );
        });
      });
    });
  });

  const relationships: Relationship[] = [];
  const circularRefCheck = new Set<string>();

  schemas.forEach((schema, schemaIndex: number) => {
    const fallbackSchemaName = normalizeSchemaName(schema.name);
    (schema.refs || []).forEach((ref, refIndex: number) => {
      if (!ref.endpoints || ref.endpoints.length !== 2) {
        warnings.push({
          message: "Reference is missing endpoints",
          context: `schema index ${schemaIndex} ref ${refIndex}`,
        });
        return;
      }

      const endpointA = ref.endpoints[0];
      const endpointB = ref.endpoints[1];

      const resolvedA = resolveTableEntry(
        tableRegistry,
        endpointA,
        fallbackSchemaName
      );
      const resolvedB = resolveTableEntry(
        tableRegistry,
        endpointB,
        fallbackSchemaName
      );

      if (!resolvedA || !resolvedB) {
        warnings.push({
          message: "Unable to resolve reference endpoints",
          context: JSON.stringify({
            endpointA: endpointA.tableName,
            endpointB: endpointB.tableName,
          }),
        });
        return;
      }

      const relationA = endpointA.relation;
      const relationB = endpointB.relation;

      let parentEndpoint = endpointB;
      let parentResolved = resolvedB;
      let childEndpoint = endpointA;
      let childResolved = resolvedA;

      const endpointAIsOne = relationA === "1";
      const endpointBIsOne = relationB === "1";

      if (endpointAIsOne && !endpointBIsOne) {
        parentEndpoint = endpointA;
        parentResolved = resolvedA;
        childEndpoint = endpointB;
        childResolved = resolvedB;
      } else if (!endpointAIsOne && endpointBIsOne) {
        parentEndpoint = endpointB;
        parentResolved = resolvedB;
        childEndpoint = endpointA;
        childResolved = resolvedA;
      } else if (endpointAIsOne && endpointBIsOne) {
        parentEndpoint = endpointB;
        parentResolved = resolvedB;
        childEndpoint = endpointA;
        childResolved = resolvedA;
      }

      const parentFields = parentEndpoint.fieldNames || [];
      const childFields = childEndpoint.fieldNames || [];
      const pairCount = Math.max(parentFields.length, childFields.length);

      for (let idx = 0; idx < pairCount; idx += 1) {
        const parentField = parentFields[idx] || parentFields[0];
        const childField = childFields[idx] || childFields[0];

        if (!parentField || !childField) {
          warnings.push({
            message: "Reference endpoint missing column name",
            context: `${parentResolved.entry.displayLabel} ↔ ${childResolved.entry.displayLabel}`,
          });
          continue;
        }

        const relationshipId = `${parentResolved.entry.schema}.${parentResolved.entry.actualName}.${parentField}->${childResolved.entry.schema}.${childResolved.entry.actualName}.${childField}:${schemaIndex}:${refIndex}:${idx}`;

        // Check for circular references
        const reverseId = `${childResolved.entry.schema}.${childResolved.entry.actualName}.${childField}->${parentResolved.entry.schema}.${parentResolved.entry.actualName}.${parentField}`;
        if (circularRefCheck.has(reverseId)) {
          warnings.push({
            message: "Potential circular reference detected",
            context: `${parentResolved.entry.displayLabel}.${parentField} ↔ ${childResolved.entry.displayLabel}.${childField}`,
          });
        }
        circularRefCheck.add(relationshipId);

        relationships.push({
          id: relationshipId,
          parent: {
            schema: parentResolved.entry.schema,
            table: parentResolved.entry.actualName,
            column: parentField,
            relation: parentEndpoint.relation,
          },
          child: {
            schema: childResolved.entry.schema,
            table: childResolved.entry.actualName,
            column: childField,
            relation: childEndpoint.relation,
          },
          onDelete: ref.onDelete || undefined,
          onUpdate: ref.onUpdate || undefined,
        });

        if (relationships.length > MAX_RELATIONSHIPS) {
          throw new Error(
            `Schema exceeds maximum relationship limit of ${MAX_RELATIONSHIPS}. Found ${relationships.length} relationships.`
          );
        }

        const childColumn =
          columnRegistry.get(
            makeColumnKey(
              childResolved.schemaName,
              childEndpoint.tableName,
              childField
            )
          ) ??
          columnRegistry.get(
            makeColumnKey(
              childResolved.entry.schema,
              childResolved.entry.actualName,
              childField
            )
          );

        if (childColumn) {
          if (!childColumn.foreignKeys) {
            childColumn.foreignKeys = [];
          }
          childColumn.foreignKeys.push({
            schema: parentResolved.entry.schema,
            table: parentResolved.entry.actualName,
            column: parentField,
            relation: parentEndpoint.relation,
            onDelete: ref.onDelete || undefined,
            onUpdate: ref.onUpdate || undefined,
          });
        } else {
          warnings.push({
            message: `Unable to attach foreign key metadata for ${childField}`,
            context: `${childResolved.entry.displayLabel}`,
          });
        }
      }
    });
  });

  return {
    sql,
    tables,
    relationships,
    warnings,
  };
}
