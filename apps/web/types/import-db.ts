export type DbType = "postgresql" | "mysql" | "sqlite" | "mongodb" | "mssql";

export interface DbTypeConfig {
  command: string;
  description: string;
  example: string;
  icon: string;
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
