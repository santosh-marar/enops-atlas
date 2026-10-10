import type { SqlDialect } from "@/lib/code-export";

export type SQLDialect = SqlDialect;

export const sqlDatabases: { value: SQLDialect; label: string }[] = [
  { label: "PostgreSQL", value: "postgres" },
  { label: "MySQL", value: "mysql" },
  { label: "SQL Server (MSSQL)", value: "mssql" },
  { label: "Oracle", value: "oracle" },
];
