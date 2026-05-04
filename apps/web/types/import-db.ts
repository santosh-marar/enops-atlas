export type DbType = "postgresql" | "mysql" | "sqlite" | "mongodb" | "mssql";

export interface DbTypeConfig {
  id: DbType;
  label: string;
  icon: string;
  description: string;
  parseFormat: "postgres" | "mysql" | "mssql" | null;
  command: string;
  example: string;
  placeholder: string;
  isAIPath: boolean;
}

export interface ImportSchemaDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}