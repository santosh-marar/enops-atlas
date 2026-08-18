export type SQLDialect = "postgres" | "mysql" | "mssql" | "oracle";

export const sqlDatabases: { value: SQLDialect; label: string }[] = [
  { label: "PostgreSQL", value: "postgres" },
  { label: "MySQL", value: "mysql" },
  { label: "SQL Server (MSSQL)", value: "mssql" },
  { label: "Oracle", value: "oracle" },
];
