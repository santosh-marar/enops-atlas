import { strict as assert } from "node:assert";
import { transformDbml } from "../lib/schema-transformer";
import { SAMPLE_DBML } from "../data/sample-dbml";

const runSampleSchemaTest = () => {
  console.log("Running sample schema test...");
  const result = transformDbml(SAMPLE_DBML);

  assert.equal(result.tables.length, 9, "expected 9 tables in sample DBML");
  assert.equal(
    result.relationships.length > 0,
    true,
    "relationships should be detected",
  );
  assert.equal(
    result.warnings.length,
    0,
    "sample DBML should not produce warnings",
  );

  const usersTable = result.tables.find(
    (table) => table.schema === "public" && table.name === "users",
  );
  assert.ok(usersTable, "users table should exist");
  assert.equal(usersTable?.alias, "U", "users table alias should be captured");
  assert.equal(
    usersTable?.referenceName,
    "U",
    "reference name should use alias when provided",
  );

  const merchantPeriods = result.tables.find(
    (table) =>
      table.schema === "ecommerce" && table.name === "merchant_periods",
  );
  assert.ok(merchantPeriods, "merchant_periods table should exist");

  const compositeRefs = result.relationships.filter(
    (rel) =>
      rel.child.table === "merchant_periods" &&
      rel.parent.table === "merchants",
  );

  assert.equal(
    compositeRefs.length,
    2,
    "composite foreign key should generate an entry per column pair",
  );

  const fkColumns = compositeRefs.map((rel) => rel.child.column).sort();
  assert.deepEqual(fkColumns, ["country_code", "merchant_id"]);
  console.log("✓ Sample schema test passed");
};

const runMissingReferenceErrorTest = () => {
  console.log("Running missing reference error test...");
  const BROKEN_SCHEMA = `
  Table accounts {
    id int [pk]
    user_id int
  }

  Ref: accounts.user_id > missing_users.id
  `;

  assert.throws(
    () => transformDbml(BROKEN_SCHEMA),
    /Can't find table/i,
    "missing foreign key target should throw a descriptive error",
  );
  console.log("✓ Missing reference error test passed");
};

const runSyntaxErrorPropagationTest = () => {
  console.log("Running syntax error propagation test...");
  assert.throws(() => transformDbml("Table broken { id "), {
    name: /Error/,
    message: /Expected/i,
  });
  console.log("✓ Syntax error propagation test passed");
};

const runEmptyDbmlTest = () => {
  console.log("Running empty DBML test...");
  assert.throws(
    () => transformDbml(""),
    /DBML string cannot be empty/i,
    "empty DBML should throw error",
  );
  assert.throws(
    () => transformDbml("   "),
    /DBML string cannot be empty/i,
    "whitespace-only DBML should throw error",
  );
  console.log("✓ Empty DBML test passed");
};

const runTableLimitTest = () => {
  console.log("Running table limit test...");
  // Create a schema with many tables to test limits
  const manyTables = Array.from(
    { length: 510 },
    (_, i) => `Table table_${i} {\n  id int [pk]\n}`,
  ).join("\n\n");

  assert.throws(
    () => transformDbml(manyTables),
    /exceeds maximum table limit/i,
    "should enforce table limit",
  );
  console.log("✓ Table limit test passed");
};

const runColumnLimitTest = () => {
  console.log("Running column limit test...");
  const manyColumns = [
    "Table big_table {",
    ...Array.from({ length: 210 }, (_, i) => `  col_${i} int`),
    "}",
  ].join("\n");

  assert.throws(
    () => transformDbml(manyColumns),
    /exceeds maximum column limit/i,
    "should enforce column limit per table",
  );
  console.log("✓ Column limit test passed");
};

const runColumnTypesTest = () => {
  console.log("Running column types test...");
  const typesSchema = `
    Table type_test {
      id int [pk]
      name varchar(255)
      price decimal(10,2)
      active bool
      created_at timestamp
    }
  `;

  const result = transformDbml(typesSchema);
  const table = result.tables[0];

  assert.ok(table, "table should exist");
  assert.equal(table.columns.length, 5, "should have 5 columns");

  const varcharCol = table.columns.find((c) => c.name === "name");
  assert.equal(
    varcharCol?.type,
    "varchar",
    "varchar type should be normalized",
  );
  assert.equal(
    varcharCol?.typeDetail,
    "255",
    "varchar length should be captured",
  );

  const decimalCol = table.columns.find((c) => c.name === "price");
  assert.equal(decimalCol?.type, "decimal", "decimal type should be present");
  assert.equal(
    decimalCol?.typeDetail,
    "10,2",
    "decimal precision should be captured",
  );

  console.log("✓ Column types test passed");
};

const runCircularReferenceTest = () => {
  console.log("Running circular reference test...");
  const circularSchema = `
    Table a {
      id int [pk]
      b_id int
    }

    Table b {
      id int [pk]
      a_id int
    }

    Ref: a.b_id > b.id
    Ref: b.a_id > a.id
  `;

  const result = transformDbml(circularSchema);
  // Should not throw but may generate warnings
  assert.ok(
    result.tables.length >= 2,
    "should parse tables with circular refs",
  );
  console.log("✓ Circular reference test passed");
};

const runDefaultValuesTest = () => {
  console.log("Running default values test...");
  const defaultsSchema = `
    Table defaults {
      id int [pk, increment]
      name varchar [default: 'unknown']
      count int [default: 0]
      active bool [default: true]
      created_at timestamp [default: \`now()\`]
    }
  `;

  const result = transformDbml(defaultsSchema);
  const table = result.tables[0];

  const nameCol = table.columns.find((c) => c.name === "name");
  assert.equal(
    nameCol?.defaultValue,
    "unknown",
    "string default should be captured",
  );
  assert.equal(
    nameCol?.defaultValueType,
    "string",
    "string type should be detected",
  );

  const countCol = table.columns.find((c) => c.name === "count");
  assert.equal(countCol?.defaultValue, 0, "numeric default should be captured");
  assert.equal(
    countCol?.defaultValueType,
    "number",
    "number type should be detected",
  );

  const activeCol = table.columns.find((c) => c.name === "active");
  assert.equal(
    activeCol?.defaultValue,
    true,
    "boolean default should be captured",
  );
  assert.equal(
    activeCol?.defaultValueType,
    "boolean",
    "boolean type should be detected",
  );

  const createdCol = table.columns.find((c) => c.name === "created_at");
  assert.equal(
    createdCol?.defaultValueType,
    "expression",
    "expression type should be detected",
  );

  console.log("✓ Default values test passed");
};

runSampleSchemaTest();
runMissingReferenceErrorTest();
runSyntaxErrorPropagationTest();
runEmptyDbmlTest();
runTableLimitTest();
runColumnLimitTest();
runColumnTypesTest();
runCircularReferenceTest();
runDefaultValuesTest();

console.log("\n✅ All schema-transformer tests passed!");
