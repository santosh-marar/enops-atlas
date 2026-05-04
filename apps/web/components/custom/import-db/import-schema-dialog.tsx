"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Copy, Check, Loader2, Sparkles, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { importer } from "@dbml/core";
import { toast } from "sonner";
import { useSchemaStore } from "@/store/use-schema-store";
import { db } from "@/lib/db";
import { generateDBMLSchema } from "@/lib/ai-client";
import Image from "next/image";
import { DbType, DbTypeConfig, ImportSchemaDialogProps } from "@/types/import-db";
import CommandBlock from "./command-block";

const DB_TYPE_CONFIGS: DbTypeConfig[] = [
  {
    id: "postgresql",
    label: "PostgreSQL",
    icon: "/database-logo/postgres.png",
    description: "pg_dump schema export",
    parseFormat: "postgres",
    command: `pg_dump --schema-only "postgresql://USER:PASSWORD@HOST:PORT/DATABASE" > schema.sql`,
    example: `pg_dump --schema-only "postgresql://admin:secret@localhost:5432/mydb" > schema.sql`,
    placeholder:
      "Paste the contents of schema.sql here...\n\nExpected format:\nCREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email VARCHAR(255) NOT NULL,\n  ...\n);",
    isAIPath: false,
  },
  {
    id: "mysql",
    label: "MySQL",
    icon: "/database-logo/mysql.png",
    description: "mysqldump schema export",
    parseFormat: "mysql",
    command: `mysqldump --no-data -u USER -p DATABASE > schema.sql`,
    example: `mysqldump --no-data -u root -p mydb > schema.sql`,
    placeholder:
      "Paste the contents of schema.sql here...\n\nExpected format:\nCREATE TABLE `users` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `email` varchar(255) NOT NULL,\n  ...\n);",
    isAIPath: false,
  },
  {
    id: "sqlite",
    label: "SQLite",
    icon: "/database-logo/sqlite.png",
    description: ".schema command output",
    parseFormat: "postgres",
    command: `sqlite3 DATABASE.db ".schema" > schema.sql`,
    example: `sqlite3 ./myapp.db ".schema" > schema.sql`,
    placeholder:
      "Paste the .schema output here...\n\nExpected format:\nCREATE TABLE users (\n  id INTEGER PRIMARY KEY,\n  email TEXT NOT NULL,\n  ...\n);",
    isAIPath: false,
  },
  {
    id: "mongodb",
    label: "MongoDB",
    icon: "/database-logo/mongodb.png",
    description: "Mongoose schema (AI-assisted)",
    parseFormat: null,
    command: "",
    example: "",
    placeholder:
      "Paste your Mongoose schema definition here...\n\nExample:\nconst userSchema = new Schema({\n  email: { type: String, required: true, unique: true },\n  name: String,\n  createdAt: { type: Date, default: Date.now }\n});",
    isAIPath: true,
  },
  {
    id: "mssql",
    label: "SQL Server",
    icon: "/database-logo/msql.png",
    description: "SSMS or sqlcmd export",
    parseFormat: "mssql",
    command: `sqlcmd -S SERVER -d DATABASE -Q "SELECT ..." -o schema.sql\n\n# Or use SSMS: Right-click DB → Tasks → Generate Scripts`,
    example: `sqlcmd -S localhost -d mydb -E -o schema.sql`,
    placeholder:
      "Paste the SQL Server DDL here...\n\nExpected format:\nCREATE TABLE [dbo].[Users] (\n  [Id] INT NOT NULL,\n  [Email] VARCHAR(255) NOT NULL,\n  ...\n);",
    isAIPath: false,
  },
];

function preprocessSQLiteSchema(sql: string): string {
  return sql
    .replace(/\bWITHOUT\s+ROWID\b/gi, "")
    .replace(/\bSTRICT\b/gi, "")
    .replace(
      /\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi,
      "SERIAL PRIMARY KEY",
    )
    .replace(/,\s*\)/g, "\n)")
    .trim();
}

function MongoDBNotice() {
  return (
    <div className="flex gap-3 rounded-lg bg-muted border border-border p-3">
      <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <p className="text-xs text-muted-foreground">
        MongoDB schemas are converted using AI. Paste your Mongoose schema
        definition and the AI will generate DBML. Make sure to configure your AI
        settings first.
      </p>
    </div>
  );
}

export function ImportSchemaDialog({
  open: controlledOpen,
  onOpenChange: controlledOpenChange,
}: ImportSchemaDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const setIsOpen = controlledOpenChange ?? setInternalOpen;

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedDb, setSelectedDb] = useState<DbType | null>(null);
  const [schemaInput, setSchemaInput] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [copiedExample, setCopiedExample] = useState(false);

  const { updateFromDBML } = useSchemaStore();

  const selectedConfig = selectedDb
    ? DB_TYPE_CONFIGS.find((c) => c.id === selectedDb)
    : null;

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setStep(1);
        setSelectedDb(null);
        setSchemaInput("");
        setCopiedCommand(false);
        setCopiedExample(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Reset copied feedback after 2s
  useEffect(() => {
    if (copiedCommand) {
      const timer = setTimeout(() => setCopiedCommand(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedCommand]);

  useEffect(() => {
    if (copiedExample) {
      const timer = setTimeout(() => setCopiedExample(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedExample]);

  // Reset copied states when selectedDb changes
  useEffect(() => {
    setCopiedCommand(false);
    setCopiedExample(false);
  }, [selectedDb]);

  async function parseSchemaToDBML(
    schema: string,
    dbType: DbType,
  ): Promise<string> {
    if (dbType === "mongodb") {
      // AI path for MongoDB
      const settings = await db.aiSettings.toArray();
      if (settings.length === 0) {
        throw new Error(
          "Please configure your AI settings first (AI Settings button in toolbar)",
        );
      }

      const { provider, claudeApiKey, openaiApiKey } = settings[0];
      const apiKey = provider === "claude" ? claudeApiKey : openaiApiKey;

      if (!apiKey) {
        throw new Error(
          `Please add your ${provider === "claude" ? "Claude" : "OpenAI"} API key in AI Settings`,
        );
      }

      const prompt = `Convert the following Mongoose schema to DBML format:\n\n${schema}\n\nGenerate a valid DBML schema.`;

      const dbml = await generateDBMLSchema({
        provider,
        apiKey,
        prompt,
      });

      return dbml;
    }

    // SQL-based parsing
    let sqlToProcess = schema.trim();

    if (dbType === "sqlite") {
      sqlToProcess = preprocessSQLiteSchema(sqlToProcess);
    }

    const parseFormat =
      DB_TYPE_CONFIGS.find((c) => c.id === dbType)?.parseFormat || "postgres";
    const dbml = importer.import(sqlToProcess, parseFormat as any);

    return dbml;
  }

  async function handleImport() {
    if (!selectedDb || !schemaInput.trim()) return;

    setIsImporting(true);
    try {
      const dbml = await parseSchemaToDBML(schemaInput.trim(), selectedDb);
      await updateFromDBML(dbml);
      toast.success("Schema imported successfully!");
      setIsOpen(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to parse schema. Check the format and try again.";
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  }

  const handleCopyCommand = async () => {
    if (!selectedConfig) return;
    try {
      await navigator.clipboard.writeText(selectedConfig.command);
      setCopiedCommand(true);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleCopyExample = async () => {
    if (!selectedConfig) return;
    try {
      await navigator.clipboard.writeText(selectedConfig.example);
      setCopiedExample(true);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent
        className={cn(
          "transition-all duration-200",
          step === 1 && "max-w-md",
          step === 2 && "min-w-4xl"
        )}
      >
        <DialogHeader>
          <DialogTitle>Import Database Schema</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Step 1: Select your database type"
              : "Step 2: Paste your schema"}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Select Database */}
        {step === 1 && (
          <div className="flex flex-col gap-3 py-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Choose Database
            </p>
            <div className="grid gap-2 max-h-content overflow-y-auto">
              {DB_TYPE_CONFIGS.map((config) => (
                <button
                  key={config.id}
                  onClick={() => {
                    setSelectedDb(config.id);
                    setSchemaInput("");
                    setStep(2);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted",
                    selectedDb === config.id
                      ? "border-primary bg-primary/5"
                      : "border-border",
                  )}
                >
                  <Image src={config?.icon} width="24" height="24" alt="database icon" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">
                      {config.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {config.description}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Paste Schema */}
        {step === 2 && selectedConfig && (
          <div className="flex gap-4 py-4 h-[60vh] min-w-3xl">
            {/* Left: Command to input db schema */}
            <div className="min-w-60">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Run this command to export schema:
              </p>
              <CommandBlock
                label="Command"
                code={selectedConfig.command}
                copied={copiedCommand}
                onCopy={handleCopyCommand}
              />
              <CommandBlock
                className="mt-6"
                label="Example (localhost)"
                code={selectedConfig.example}
                copied={copiedExample}
                onCopy={handleCopyExample}
              />
            </div>

            {/* Mongodb Notice */}
            {selectedDb === "mongodb" && <MongoDBNotice />}

            {/* Right: Textarea Input */}
            <div className="w-full h-full min-w-xl max-w-xl">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Paste your schema:
              </p>
              <div className="flex flex-col gap-2 h-full">
                <Label htmlFor="schema-input">
                  {selectedDb === "mongodb"
                    ? "Mongoose Schema"
                    : "Schema Output"}
                </Label>
                <Textarea
                  id="schema-input"
                  className="font-mono text-xs h-full resize-none"
                  placeholder={selectedConfig?.placeholder}
                  value={schemaInput}
                  onChange={(e) => setSchemaInput(e.target.value)}
                  disabled={isImporting}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-center">
          {step === 2 && (
            <Button
              variant="ghost"
              onClick={() => setStep(1)}
              disabled={isImporting}
            >
              Back
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="ghost">Skip</Button>
          </DialogClose>
          {step === 2 && (
            <Button
              onClick={handleImport}
              disabled={!schemaInput.trim() || isImporting}
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <span className="">Import Schema</span>
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
