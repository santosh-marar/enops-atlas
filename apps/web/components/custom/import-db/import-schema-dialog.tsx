"use client";

import { importer } from "@dbml/core";
import { ChevronRight, Loader2, Sparkles } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateDBMLSchema } from "@/lib/ai-client";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { useSchemaStore } from "@/store/use-schema-store";
import type {
  DbType,
  DbTypeConfig,
  ImportSchemaDialogProps,
} from "@/types/import-db";
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
    command: "mysqldump --no-data -u USER -p DATABASE > schema.sql",
    example: "mysqldump --no-data -u root -p mydb > schema.sql",
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
    example: "sqlcmd -S localhost -d mydb -E -o schema.sql",
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
      "SERIAL PRIMARY KEY"
    )
    .replace(/,\s*\)/g, "\n)")
    .trim();
}

function MongoDBNotice() {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-muted p-3">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p className="text-muted-foreground text-xs">
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
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  async function parseSchemaToDBML(
    schema: string,
    dbType: DbType
  ): Promise<string> {
    if (dbType === "mongodb") {
      // AI path for MongoDB
      const settings = await db.aiSettings.toArray();
      if (settings.length === 0) {
        throw new Error(
          "Please configure your AI settings first (AI Settings button in toolbar)"
        );
      }

      const { provider, claudeApiKey, openaiApiKey } = settings[0];
      const apiKey = provider === "claude" ? claudeApiKey : openaiApiKey;

      if (!apiKey) {
        throw new Error(
          `Please add your ${provider === "claude" ? "Claude" : "OpenAI"} API key in AI Settings`
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
    if (!(selectedDb && schemaInput.trim())) return;

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

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
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
            <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              Choose Database
            </p>
            <div className="grid max-h-content gap-2 overflow-y-auto">
              {DB_TYPE_CONFIGS.map((config) => (
                <button
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted",
                    selectedDb === config.id
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  )}
                  key={config.id}
                  onClick={() => {
                    setSelectedDb(config.id);
                    setSchemaInput("");
                    setStep(2);
                  }}
                >
                  <Image
                    alt="database icon"
                    height="24"
                    src={config?.icon}
                    width="24"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm leading-tight">
                      {config.label}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {config.description}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Paste Schema */}
        {step === 2 && selectedConfig && (
          <div className="flex h-[60vh] min-w-3xl gap-4 py-4">
            {/* Left: Command to input db schema */}
            <div className="min-w-60">
              <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Run this command to export schema:
              </p>
              <CommandBlock code={selectedConfig.command} label="Command" />
              <CommandBlock
                className="mt-6"
                code={selectedConfig.example}
                label="Example (localhost)"
              />
            </div>

            {/* Mongodb Notice */}
            {selectedDb === "mongodb" && <MongoDBNotice />}

            {/* Right: Textarea Input */}
            <div className="h-full w-full min-w-xl max-w-xl">
              <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Paste your schema:
              </p>
              <div className="flex h-full flex-col gap-2">
                <Label htmlFor="schema-input">
                  {selectedDb === "mongodb"
                    ? "Mongoose Schema"
                    : "Schema Output"}
                </Label>
                <Textarea
                  className="h-full resize-none font-mono text-xs"
                  disabled={isImporting}
                  id="schema-input"
                  onChange={(e) => setSchemaInput(e.target.value)}
                  placeholder={selectedConfig?.placeholder}
                  value={schemaInput}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-center">
          {step === 2 && (
            <Button
              disabled={isImporting}
              onClick={() => setStep(1)}
              variant="ghost"
            >
              Back
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="ghost">Skip</Button>
          </DialogClose>
          {step === 2 && (
            <Button
              disabled={!schemaInput.trim() || isImporting}
              onClick={handleImport}
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <span className="">Import Schema</span>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
