import { ModelExporter, Parser } from "@dbml/core";

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
  indexType?: "btree" | "hash" | "gist" | "gin" | "brin";
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

const TYPE_SHORTHANDS: Record<string, string> = {
  bigint: "bigint",
  bigserial: "bigserial",
  bool: "bool",
  boolean: "bool",
  "character varying": "varchar",
  datetime: "datetime",
  decimal: "decimal",
  double: "double",
  int4: "int",
  integer: "int",
  numeric: "numeric",
  serial: "serial",
  smallint: "smallint",
  text: "text",
  timestamp: "timestamp",
  timestamptz: "timestamptz",
  varchar: "varchar",
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
  args?: string | string[] | number[];
  type_name?: string;
  values?: string[];
}

interface DbmlField {
  dbdefault?: unknown;
  increment?: boolean;
  name: string;
  not_null?: boolean;
  note?: string | { value?: string };
  pk?: boolean;
  type?: DbmlFieldType;
  unique?: boolean;
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
    ? { detail: detail.toString(), type: displayType }
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
    return { type: "null", value: null };
  }

  if (
    typeof dbdefault === "object" &&
    dbdefault !== null &&
    "type" in dbdefault
  ) {
    const defaultObj = dbdefault as DbmlDefaultValue;
    const { type, value } = defaultObj;
    switch (type) {
      case "number":
        return { type: "number", value: Number(value) };
      case "string":
        return { type: "string", value: String(value) };
      case "boolean":
        return { type: "boolean", value: Boolean(value) };
      case "expression":
        return { type: "expression", value: String(value) };
      default:
        return { type: "string", value: String(value) };
    }
  }

  if (typeof dbdefault === "number") {
    return { type: "number", value: dbdefault };
  }
  if (typeof dbdefault === "boolean") {
    return { type: "boolean", value: dbdefault };
  }
  if (typeof dbdefault === "string") {
    const isExpression = /\(|\)|now|current|uuid|gen_random/i.test(dbdefault);
    return { type: isExpression ? "expression" : "string", value: dbdefault };
  }

  return { type: "string", value: String(dbdefault) };
};

interface TableRegistryEntry {
  actualName: string;
  alias?: string;
  columns: Column[];
  displayLabel: string;
  referenceName: string;
  schema: string;
}

interface ResolvedEndpoint {
  entry: TableRegistryEntry;
  schemaName: string;
}

interface DbmlEndpoint {
  fieldNames?: string[];
  relation?: string;
  schemaName?: string;
  tableName: string;
}

interface DbmlTable {
  alias?: string;
  fields: DbmlField[];
  indexes?: DbmlIndex[];
  name: string;
}

interface DbmlIndex {
  columns?: Array<{ value?: string | { name?: string } }>;
  pk?: boolean | string;
  type?: string;
  unique?: boolean;
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
  enums?: DbmlEnum[];
  name?: string;
  refs?: DbmlRef[];
  tables?: DbmlTable[];
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
          typeof v === "object" && v.name ? v.name : String(v)
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
          context: `schema ${schemaName}`,
          message: "Table missing name",
        });
        return;
      }

      if (!table.fields || table.fields.length === 0) {
        warnings.push({
          context: schemaName,
          message: `Table "${table.name}" has no columns`,
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
          autoIncrement: Boolean(field.increment),
          foreignKeys: [],
          name: field.name,
          nullable: !field.not_null,
          primaryKey: Boolean(field.pk),
          type,
          unique: Boolean(field.unique),
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
            column.length =
              typeof arg === "number" ? arg : Number.parseInt(String(arg), 10);
          }
          if (field.type.args.length === 2) {
            const arg0 = field.type.args[0];
            const arg1 = field.type.args[1];
            column.precision =
              typeof arg0 === "number"
                ? arg0
                : Number.parseInt(String(arg0), 10);
            column.scale =
              typeof arg1 === "number"
                ? arg1
                : Number.parseInt(String(arg1), 10);
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
          } else if (
            typeof idxCol.value === "object" &&
            idxCol.value !== null
          ) {
            columnName = idxCol.value.name;
          }

          if (!columnName) {
            warnings.push({
              context: `${displayLabel} index`,
              message: "Index column missing name",
            });
            return;
          }

          const column = columns.find((col) => col.name === columnName);
          if (!column) {
            warnings.push({
              context: displayLabel,
              message: `Index references unknown column "${columnName}"`,
            });
            return;
          }

          column.indexed = true;

          if (index.type && typeof index.type === "string") {
            const validTypes = ["btree", "hash", "gist", "gin", "brin"];
            if (validTypes.includes(index.type)) {
              column.indexType = index.type as
                | "btree"
                | "hash"
                | "gist"
                | "gin"
                | "brin";
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
        alias: table.alias || undefined,
        columns,
        displayLabel,
        name: table.name,
        referenceName,
        schema: schemaName,
      };

      tables.push(tableEntry);

      const registryEntry: TableRegistryEntry = {
        actualName: table.name,
        alias: table.alias || undefined,
        columns,
        displayLabel,
        referenceName,
        schema: schemaName,
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
          context: `schema index ${schemaIndex} ref ${refIndex}`,
          message: "Reference is missing endpoints",
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

      if (!(resolvedA && resolvedB)) {
        warnings.push({
          context: JSON.stringify({
            endpointA: endpointA.tableName,
            endpointB: endpointB.tableName,
          }),
          message: "Unable to resolve reference endpoints",
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

        if (!(parentField && childField)) {
          warnings.push({
            context: `${parentResolved.entry.displayLabel} ↔ ${childResolved.entry.displayLabel}`,
            message: "Reference endpoint missing column name",
          });
          continue;
        }

        const relationshipId = `${parentResolved.entry.schema}.${parentResolved.entry.actualName}.${parentField}->${childResolved.entry.schema}.${childResolved.entry.actualName}.${childField}:${schemaIndex}:${refIndex}:${idx}`;

        // Check for circular references
        const reverseId = `${childResolved.entry.schema}.${childResolved.entry.actualName}.${childField}->${parentResolved.entry.schema}.${parentResolved.entry.actualName}.${parentField}`;
        if (circularRefCheck.has(reverseId)) {
          warnings.push({
            context: `${parentResolved.entry.displayLabel}.${parentField} ↔ ${childResolved.entry.displayLabel}.${childField}`,
            message: "Potential circular reference detected",
          });
        }
        circularRefCheck.add(relationshipId);

        relationships.push({
          child: {
            column: childField,
            relation: childEndpoint.relation,
            schema: childResolved.entry.schema,
            table: childResolved.entry.actualName,
          },
          id: relationshipId,
          onDelete: ref.onDelete || undefined,
          onUpdate: ref.onUpdate || undefined,
          parent: {
            column: parentField,
            relation: parentEndpoint.relation,
            schema: parentResolved.entry.schema,
            table: parentResolved.entry.actualName,
          },
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
            column: parentField,
            onDelete: ref.onDelete || undefined,
            onUpdate: ref.onUpdate || undefined,
            relation: parentEndpoint.relation,
            schema: parentResolved.entry.schema,
            table: parentResolved.entry.actualName,
          });
        } else {
          warnings.push({
            context: `${childResolved.entry.displayLabel}`,
            message: `Unable to attach foreign key metadata for ${childField}`,
          });
        }
      }
    });
  });

  return {
    relationships,
    sql,
    tables,
    warnings,
  };
}
