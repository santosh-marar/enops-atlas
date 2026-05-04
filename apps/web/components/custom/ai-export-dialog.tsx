"use client";

import { ModelExporter, Parser } from "@dbml/core";
import type { Edge, Node } from "@xyflow/react";
import {
  Check,
  Copy,
  Download,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generateCode } from "@/lib/ai-client";
import { db } from "@/lib/db";
import { useSchemaStore } from "@/store/use-schema-store";
import { APISettingsDialog } from "./api-settings-dialog";

type ORM = "prisma" | "drizzle" | "mongoose" | "typeorm" | "sequelize";
type Database = "postgresql" | "mysql" | "mongodb" | "sqlite" | "mariadb";
type SQLDialect = "postgresql" | "mysql" | "mssql";
type ExportFormatType = "postgres" | "mysql" | "mssql";

interface ExportDialogProps {
  children?: React.ReactNode;
  edges: Edge[];
  nodes: Node[];
}

const ormOptions = [
  {
    value: "prisma",
    label: "Prisma",
    description: "Next-generation ORM for TypeScript",
  },
  {
    value: "drizzle",
    label: "Drizzle ORM",
    description: "TypeScript ORM with SQL-like syntax",
  },
  {
    value: "mongoose",
    label: "Mongoose",
    description: "MongoDB object modeling",
  },
  {
    value: "typeorm",
    label: "TypeORM",
    description: "ORM for TypeScript and JavaScript",
  },
  {
    value: "sequelize",
    label: "Sequelize",
    description: "Promise-based Node.js ORM",
  },
];

const databaseOptions = [
  {
    value: "postgresql",
    label: "PostgreSQL",
    compatibleWith: ["prisma", "drizzle", "typeorm", "sequelize"],
  },
  {
    value: "mysql",
    label: "MySQL",
    compatibleWith: ["prisma", "drizzle", "typeorm", "sequelize"],
  },
  {
    value: "mongodb",
    label: "MongoDB",
    compatibleWith: ["mongoose", "prisma"],
  },
  {
    value: "sqlite",
    label: "SQLite",
    compatibleWith: ["prisma", "drizzle", "typeorm", "sequelize"],
  },
  {
    value: "mariadb",
    label: "MariaDB",
    compatibleWith: ["prisma", "drizzle", "typeorm", "sequelize"],
  },
];

export function AIExportDialog({ children, nodes, edges }: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedORM, setSelectedORM] = useState<ORM | "">("");
  const [selectedDatabase, setSelectedDatabase] = useState<Database | "">("");
  const [selectedSQLDialect, setSelectedSQLDialect] =
    useState<SQLDialect>("postgresql");
  const [generatedCode, setGeneratedCode] = useState("");
  const [generatedSQL, setGeneratedSQL] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("configure");
  const textareaRef = useRef<HTMLPreElement>(null);
  const { dbml } = useSchemaStore();

  const generatePrompt = () => {
    const schemaDescription = nodes
      .map((node) => {
        const { data } = node;
        const fields = data.fields as any[] | undefined;
        return `Table: ${data.label}

Fields: ${fields?.map((f: any) => `${f.name} (${f.type}${f.required ? ", required" : ""})`).join(", ") || "No fields"}`;
      })
      .join("\n\n");

    const relationships = edges
      .map((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);
        return `${sourceNode?.data.label} -> ${targetNode?.data.label} (${edge.data?.relationType || "relation"})`;
      })
      .join("\n");

    return `Generate ${selectedORM} schema for ${selectedDatabase} database:

Schema:
${schemaDescription}

Relationships:
${relationships || "No relationships defined"}

Please provide complete, production-ready code with:
1. Proper data types for ${selectedDatabase}
2. Relationships and foreign keys
3. Indexes where appropriate
4. Validation rules
5. Best practices for ${selectedORM}`;
  };

  const handleGenerate = async () => {
    if (!(selectedORM && selectedDatabase)) {
      return;
    }

    setIsGenerating(true);
    setGeneratedCode("");
    setActiveTab("preview");

    try {
      const settings = await db.aiSettings.toArray();
      if (settings.length === 0) {
        toast.error("Please configure your API settings first");
        setIsGenerating(false);
        setActiveTab("configure");
        return;
      }

      const { provider, claudeApiKey, openaiApiKey } = settings[0];
      const apiKey = provider === "claude" ? claudeApiKey : openaiApiKey;

      if (!apiKey) {
        toast.error(
          `Please add your ${provider === "claude" ? "Claude" : "OpenAI"} API key in settings`
        );
        setIsGenerating(false);
        setActiveTab("configure");
        return;
      }

      const prompt = generatePrompt();

      let streamedCode = "";
      await generateCode({
        provider,
        apiKey,
        prompt,
        orm: selectedORM,
        database: selectedDatabase,
        onStream: (chunk: string) => {
          streamedCode += chunk;
          setGeneratedCode(streamedCode);
        },
      });

      toast.success("Code generated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate code");
      setGeneratedCode(
        `Error: ${error.message || "Failed to generate code. Please try again."}`
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const fileExtensions: Record<ORM, string> = {
      prisma: "prisma",
      drizzle: "ts",
      mongoose: "ts",
      typeorm: "ts",
      sequelize: "ts",
    };

    const ext = selectedORM ? fileExtensions[selectedORM] : "txt";
    const blob = new Blob([generatedCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schema.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleGenerateSQL = () => {
    try {
      if (!dbml) {
        toast.error("No schema to export. Please create a schema first.");
        return;
      }

      const model = new Parser().parse(dbml, "dbml");
      const exportFormat: ExportFormatType =
        selectedSQLDialect === "postgresql" ? "postgres" : selectedSQLDialect;
      const sql = ModelExporter.export(model, exportFormat);
      setGeneratedSQL(sql);
      setActiveTab("sql");
      toast.success("SQL generated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate SQL");
    }
  };

  const handleDownloadSQL = () => {
    const ext =
      selectedSQLDialect === "postgresql"
        ? "sql"
        : selectedSQLDialect === "mysql"
          ? "sql"
          : "sql";
    const blob = new Blob([generatedSQL], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schema.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopySQL = async () => {
    await navigator.clipboard.writeText(generatedSQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredDatabases = databaseOptions.filter(
    (db) => !selectedORM || db.compatibleWith.includes(selectedORM as string)
  );

  useEffect(() => {
    if (
      isGenerating &&
      textareaRef.current &&
      textareaRef.current.parentElement
    ) {
      const container = textareaRef.current.parentElement;
      container.scrollTop = container.scrollHeight;
    }
  }, [generatedCode, isGenerating]);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {children || (
          <Button size={"sm"} variant="ghost">
            <Download className="mr-2 h-4 w-4" />
            Export Schema
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="z-50 max-h-[90vh] min-w-2xl max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI-Powered Schema Export
            </DialogTitle>
            <APISettingsDialog>
              <Button size="sm" variant="ghost">
                <SettingsIcon className="h-4 w-4" />
              </Button>
            </APISettingsDialog>
          </div>
          <DialogDescription>
            Choose your ORM/ODM and database, then let AI generate
            production-ready code
          </DialogDescription>
        </DialogHeader>

        <Tabs className="w-full" onValueChange={setActiveTab} value={activeTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="configure">Configure</TabsTrigger>
            <TabsTrigger
              disabled={!(generatedCode || isGenerating)}
              value="preview"
            >
              Preview & Export
            </TabsTrigger>
            <TabsTrigger value="sql">Raw SQL</TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-6" value="configure">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orm">Select ORM/ODM</Label>
                <Select
                  onValueChange={(value) => {
                    setSelectedORM(value as ORM);
                    setSelectedDatabase("");
                    setGeneratedCode("");
                  }}
                  value={selectedORM}
                >
                  <SelectTrigger id="orm">
                    <SelectValue placeholder="Choose your ORM/ODM" />
                  </SelectTrigger>
                  <SelectContent>
                    {ormOptions.map((orm) => (
                      <SelectItem key={orm.value} value={orm.value}>
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{orm.label}</span>
                          <span className="text-muted-foreground text-xs">
                            {orm.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="database">Select Database</Label>
                <Select
                  disabled={!selectedORM}
                  onValueChange={(value) => {
                    setSelectedDatabase(value as Database);
                    setGeneratedCode("");
                  }}
                  value={selectedDatabase}
                >
                  <SelectTrigger id="database">
                    <SelectValue placeholder="Choose your database" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredDatabases.map((db) => (
                      <SelectItem key={db.value} value={db.value}>
                        {db.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedORM && (
                  <p className="text-muted-foreground text-xs">
                    Showing databases compatible with{" "}
                    {ormOptions.find((o) => o.value === selectedORM)?.label}
                  </p>
                )}
              </div>

              {selectedORM && selectedDatabase && (
                <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{selectedORM}</Badge>
                    <span className="text-muted-foreground text-sm">+</span>
                    <Badge variant="secondary">{selectedDatabase}</Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    AI will generate optimized schema code based on your visual
                    design
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                className="w-full sm:w-auto"
                disabled={!(selectedORM && selectedDatabase) || isGenerating}
                onClick={handleGenerate}
              >
                {isGenerating ? (
                  <>
                    <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Code
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent className="space-y-4" value="preview">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label>Generated Code</Label>
                  {isGenerating && (
                    <div className="flex items-center gap-1 text-muted-foreground text-xs">
                      <Sparkles className="h-3 w-3 animate-pulse" />
                      <span>Generating...</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    disabled={!generatedCode || isGenerating}
                    onClick={handleCopy}
                    size="sm"
                    variant="outline"
                  >
                    {copied ? (
                      <Check className="mr-2 h-4 w-4" />
                    ) : (
                      <Copy className="mr-2 h-4 w-4" />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button
                    disabled={!generatedCode || isGenerating}
                    onClick={handleDownload}
                    size="sm"
                    variant="outline"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
              </div>
              <div className="relative overflow-hidden rounded-md border">
                <div className="h-full min-h-[480px] overflow-y-auto scroll-smooth bg-card p-3">
                  <pre
                    className="break-word min-h-full whitespace-pre-wrap font-mono text-foreground text-sm"
                    ref={textareaRef}
                  >
                    {generatedCode || (
                      <span className="text-muted-foreground">
                        {isGenerating
                          ? "AI is generating your code..."
                          : "Generated code will appear here..."}
                      </span>
                    )}
                  </pre>
                </div>
                {isGenerating && !generatedCode && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2">
                      <Sparkles className="h-8 w-8 animate-pulse text-primary" />
                      <p className="text-muted-foreground text-sm">
                        Starting generation...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!isGenerating && generatedCode && (
              <div className="rounded-lg border bg-muted/50 p-4">
                <p className="text-muted-foreground text-sm">
                  Review the generated code and make any necessary adjustments
                  before using it in your project.
                </p>
              </div>
            )}

            {isGenerating && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-5 w-5 animate-pulse text-primary" />
                  <div className="space-y-1">
                    <p className="font-medium text-sm">
                      Generating your schema code
                    </p>
                    <p className="text-muted-foreground text-xs">
                      AI is analyzing your schema and creating optimized{" "}
                      {selectedORM} code for {selectedDatabase}...
                    </p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent className="space-y-4" value="sql">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sql-dialect">Select SQL Dialect</Label>
                <Select
                  onValueChange={(value) =>
                    setSelectedSQLDialect(value as SQLDialect)
                  }
                  value={selectedSQLDialect}
                >
                  <SelectTrigger id="sql-dialect">
                    <SelectValue placeholder="Choose SQL dialect" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="postgresql">PostgreSQL</SelectItem>
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="mssql">SQL Server (MSSQL)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full" onClick={handleGenerateSQL}>
                Generate Raw SQL
              </Button>
            </div>

            {generatedSQL && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Generated SQL</Label>
                  <div className="flex gap-2">
                    <Button
                      disabled={!generatedSQL}
                      onClick={handleCopySQL}
                      size="sm"
                      variant="outline"
                    >
                      {copied ? (
                        <Check className="mr-2 h-4 w-4" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      {copied ? "Copied!" : "Copy"}
                    </Button>
                    <Button
                      disabled={!generatedSQL}
                      onClick={handleDownloadSQL}
                      size="sm"
                      variant="outline"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-md border">
                  <div className="h-full min-h-[480px] overflow-y-auto scroll-smooth bg-card p-3">
                    <pre className="break-word min-h-full whitespace-pre-wrap font-mono text-foreground text-sm">
                      {generatedSQL}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {!generatedSQL && (
              <div className="rounded-lg border bg-muted/50 p-4">
                <p className="text-muted-foreground text-sm">
                  Select a SQL dialect and click "Generate Raw SQL" to export
                  your schema as raw SQL DDL statements.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
