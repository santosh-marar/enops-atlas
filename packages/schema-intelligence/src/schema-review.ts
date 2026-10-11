import { renderDbml } from "@enops/atlas-schema";
import { schemaSnapshot } from "./schema-snapshot";

/** Field choices are proposals only. Refuse any unprovable physical round-trip. */
export function chooseSchemaField(
  proposal: string,
  source: string,
  tableName: string,
  fieldName: string
): string {
  const current = schemaSnapshot(proposal);
  const selected = schemaSnapshot(source);
  const canonical = structuredClone(current.canonical);
  // Never use a reduced model to silently erase physical details.
  if (schemaSnapshot(renderDbml(canonical)).digest !== current.digest)
    throw new Error(
      "This schema needs a manual DBML merge to preserve all details."
    );
  const table = canonical.tables.find(
    (table) => `${table.schema}.${table.name}` === tableName
  );
  const sourceTable = selected.canonical.tables.find(
    (table) => `${table.schema}.${table.name}` === tableName
  );
  if (!(table && sourceTable))
    throw new Error(
      "Choose a starting schema containing this table, or merge the table in DBML."
    );
  const incoming = sourceTable.columns.find(
    (column) => column.name === fieldName
  );
  const index = table.columns.findIndex((column) => column.name === fieldName);
  if (incoming) {
    if (index < 0) table.columns.push(incoming);
    else table.columns[index] = incoming;
  } else if (index >= 0) table.columns.splice(index, 1);
  // A field picker must not implicitly alter composite constraints or relations.
  const output = renderDbml(canonical);
  // Compare everything except the explicitly selected field, including constraints.
  const after = schemaSnapshot(output);
  const selectedField = selected.physical.tables
    .find((table) => table.fullName === tableName)
    ?.columns.find((column) => column.name === fieldName);
  const outputField = after.physical.tables
    .find((table) => table.fullName === tableName)
    ?.columns.find((column) => column.name === fieldName);
  if (JSON.stringify(selectedField) !== JSON.stringify(outputField))
    throw new Error(
      "This field requires an explicit DBML merge to preserve its exact definition."
    );
  const withoutField = (snapshot: typeof current) =>
    JSON.stringify({
      ...snapshot.physical,
      tables: snapshot.physical.tables.map((table) =>
        table.fullName === tableName
          ? {
              ...table,
              columns: table.columns.filter(
                (column) => column.name !== fieldName
              ),
            }
          : table
      ),
    });
  if (withoutField(current) !== withoutField(after))
    throw new Error(
      "This field affects constraints or relationships. Merge it explicitly in DBML."
    );
  return output;
}
