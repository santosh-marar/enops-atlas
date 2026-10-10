export type DbType =
  | "postgresql"
  | "mysql"
  | "sqlite"
  | "mongodb"
  | "mssql"
  | "dbml"
  | "prisma"
  | "drizzle";

/** A schema file read in the browser and sent to the import route. */
export interface ImportFile {
  content: string;
  path: string;
}

export interface DbTypeConfig {
  command: string;
  description: string;
  example: string;
  /** Logo in /public. Types without one get a generic file icon. */
  icon?: string;
  id: DbType;
  isAIPath: boolean;
  label: string;
  parseFormat: "postgres" | "mysql" | "mssql" | null;
  placeholder: string;
}

export interface ImportSchemaDialogProps {
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}
