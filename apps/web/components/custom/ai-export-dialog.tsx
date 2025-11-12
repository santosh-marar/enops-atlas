"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download,
  Sparkles,
  Copy,
  Check,
  Settings as SettingsIcon,
} from "lucide-react";
import { Node, Edge } from "@xyflow/react";
import { db } from "@/lib/db";
import { toast } from "sonner";
import { APISettingsDialog } from "./api-settings-dialog";
import { generateCode } from "@/lib/ai-client";

type ORM = "prisma" | "drizzle" | "mongoose" | "typeorm" | "sequelize";
type Database = "postgresql" | "mysql" | "mongodb" | "sqlite" | "mariadb";

interface ExportDialogProps {
  children?: React.ReactNode;
  nodes: Node[];
  edges: Edge[];
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
  const [generatedCode, setGeneratedCode] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("configure");
  const textareaRef = useRef<HTMLPreElement>(null);

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
    if (!selectedORM || !selectedDatabase) return;

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
          `Please add your ${provider === "claude" ? "Claude" : "OpenAI"} API key in settings`,
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
        `Error: ${error.message || "Failed to generate code. Please try again."}`,
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

  const filteredDatabases = databaseOptions.filter(
    (db) => !selectedORM || db.compatibleWith.includes(selectedORM as string),
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="ghost" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export Schema
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="min-w-2xl max-w-3xl max-h-[90vh] overflow-y-auto z-50">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI-Powered Schema Export
            </DialogTitle>
            <APISettingsDialog>
              <Button variant="ghost" size="sm">
                <SettingsIcon className="h-4 w-4" />
              </Button>
            </APISettingsDialog>
          </div>
          <DialogDescription>
            Choose your ORM/ODM and database, then let AI generate
            production-ready code
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="configure">Configure</TabsTrigger>
            <TabsTrigger
              value="preview"
              disabled={!generatedCode && !isGenerating}
            >
              Preview & Export
            </TabsTrigger>
          </TabsList>

          <TabsContent value="configure" className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orm">Select ORM/ODM</Label>
                <Select
                  value={selectedORM}
                  onValueChange={(value) => {
                    setSelectedORM(value as ORM);
                    setSelectedDatabase("");
                    setGeneratedCode("");
                  }}
                >
                  <SelectTrigger id="orm">
                    <SelectValue placeholder="Choose your ORM/ODM" />
                  </SelectTrigger>
                  <SelectContent>
                    {ormOptions.map((orm) => (
                      <SelectItem key={orm.value} value={orm.value}>
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{orm.label}</span>
                          <span className="text-xs text-muted-foreground">
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
                  value={selectedDatabase}
                  onValueChange={(value) => {
                    setSelectedDatabase(value as Database);
                    setGeneratedCode("");
                  }}
                  disabled={!selectedORM}
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
                  <p className="text-xs text-muted-foreground">
                    Showing databases compatible with{" "}
                    {ormOptions.find((o) => o.value === selectedORM)?.label}
                  </p>
                )}
              </div>

              {selectedORM && selectedDatabase && (
                <div className="rounded-lg border p-4 space-y-3 bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{selectedORM}</Badge>
                    <span className="text-sm text-muted-foreground">+</span>
                    <Badge variant="secondary">{selectedDatabase}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    AI will generate optimized schema code based on your visual
                    design
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                onClick={handleGenerate}
                disabled={!selectedORM || !selectedDatabase || isGenerating}
                className="w-full sm:w-auto"
              >
                {isGenerating ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2 animate-pulse" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Code
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label>Generated Code</Label>
                  {isGenerating && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Sparkles className="h-3 w-3 animate-pulse" />
                      <span>Generating...</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    disabled={!generatedCode || isGenerating}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 mr-2" />
                    ) : (
                      <Copy className="h-4 w-4 mr-2" />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    disabled={!generatedCode || isGenerating}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
              <div className="relative overflow-hidden rounded-md border">
                <div className="h-full min-h-[480px] overflow-y-auto p-3 bg-card scroll-smooth">
                  <pre
                    ref={textareaRef}
                    className="font-mono text-sm whitespace-pre-wrap break-word min-h-full text-foreground"
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
                      <p className="text-sm text-muted-foreground">
                        Starting generation...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!isGenerating && generatedCode && (
              <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  Review the generated code and make any necessary adjustments
                  before using it in your project.
                </p>
              </div>
            )}

            {isGenerating && (
              <div className="rounded-lg border p-4 bg-primary/5 border-primary/20">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 animate-pulse text-primary mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      Generating your schema code
                    </p>
                    <p className="text-xs text-muted-foreground">
                      AI is analyzing your schema and creating optimized{" "}
                      {selectedORM} code for {selectedDatabase}...
                    </p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
