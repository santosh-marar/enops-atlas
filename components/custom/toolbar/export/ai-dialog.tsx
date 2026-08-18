"use client";

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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ModelKey, streamAI } from "@/lib/ai";
import { db } from "@/lib/db";
import { useSchemaStore } from "@/store/use-schema-store";
import { APISettingsDialog } from "../../api-settings-dialog";

type ORM = "prisma" | "drizzle" | "mongoose" | "typeorm" | "sequelize";
type Database = "postgresql" | "mysql" | "mongodb" | "sqlite" | "mariadb";

const ormOptions = [
  {
    description: "Next-generation ORM for TypeScript",
    label: "Prisma",
    value: "prisma",
  },
  {
    description: "TypeScript ORM with SQL-like syntax",
    label: "Drizzle ORM",
    value: "drizzle",
  },
  {
    description: "MongoDB object modeling",
    label: "Mongoose",
    value: "mongoose",
  },
  {
    description: "ORM for TypeScript and JavaScript",
    label: "TypeORM",
    value: "typeorm",
  },
  {
    description: "Promise-based Node.js ORM",
    label: "Sequelize",
    value: "sequelize",
  },
];

const databaseOptions = [
  {
    compatibleWith: ["prisma", "drizzle", "typeorm", "sequelize"],
    label: "PostgreSQL",
    value: "postgresql",
  },
  {
    compatibleWith: ["prisma", "drizzle", "typeorm", "sequelize"],
    label: "MySQL",
    value: "mysql",
  },
  {
    compatibleWith: ["mongoose", "prisma"],
    label: "MongoDB",
    value: "mongodb",
  },
  {
    compatibleWith: ["prisma", "drizzle", "typeorm", "sequelize"],
    label: "SQLite",
    value: "sqlite",
  },
  {
    compatibleWith: ["prisma", "drizzle", "typeorm", "sequelize"],
    label: "MariaDB",
    value: "mariadb",
  },
];

// Now a controlled component — open state lives with the caller.
interface AIDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function AIDialog({ open, onOpenChange }: AIDialogProps) {
  const [selectedORM, setSelectedORM] = useState<ORM | "">("");
  const [selectedDatabase, setSelectedDatabase] = useState<Database | "">("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("configure");
  const textareaRef = useRef<HTMLPreElement>(null);
  const { nodes, edges } = useSchemaStore();

  const generatePrompt = () => {
    const schemaDescription = nodes
      .map((node) => {
        const { data } = node;
        const fields = data.fields as any[] | undefined;
        return `Table: ${data.label}\n\nFields: ${fields?.map((f: any) => `${f.name} (${f.type}${f.required ? ", required" : ""})`).join(", ") || "No fields"}`;
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
    if (!(selectedORM && selectedDatabase)) return;

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

      const { vercelAIKey } = settings[0];

      if (!vercelAIKey) {
        toast.error("Please add your Vercel AI key in settings");
        setIsGenerating(false);
        setActiveTab("configure");
        return;
      }

      const modelKey: ModelKey = "claude-sonnet-5";
      const prompt = generatePrompt();
      let streamedCode = "";

      const result = streamAI({
        apiKey: vercelAIKey,
        maxOutputTokens: 8192,
        messages: [{ content: prompt, role: "user" }],
        modelKey,
        system: `You are an expert ${selectedORM} developer generating production-ready schema for ${selectedDatabase}. Give user no explanations, just the schema or nothing else.`,
        temperature: 0.1,
      });

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          streamedCode += part.text;
          setGeneratedCode(streamedCode);
        }
      }

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
      drizzle: "ts",
      mongoose: "ts",
      prisma: "prisma",
      sequelize: "ts",
      typeorm: "ts",
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
    (d) => !selectedORM || d.compatibleWith.includes(selectedORM as string)
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
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="z-50 flex h-[75vh] max-h-[75vh] min-w-5xl max-w-7xl flex-col overflow-hidden px-8 py-12">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI-Powered Schema Export
            </DialogTitle>
            <APISettingsDialog>
              <Button size={"icon-sm"} variant="outline">
                <SettingsIcon className="h-4 w-4" />
                <span className="sr-only">AI Settings</span>
              </Button>
            </APISettingsDialog>
          </div>
          <DialogDescription>
            Choose your ORM/ODM and database, then let AI generate
            production-ready code
          </DialogDescription>
        </DialogHeader>
        <Tabs
          className="flex min-h-0 w-full flex-1 flex-col"
          onValueChange={setActiveTab}
          value={activeTab}
        >
          <TabsList className="grid w-full shrink-0 grid-cols-2">
            <TabsTrigger value="configure">Configure</TabsTrigger>
            <TabsTrigger
              disabled={!(generatedCode || isGenerating)}
              value="preview"
            >
              Preview & Export
            </TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-6 overflow-y-auto" value="configure">
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
                  <SelectTrigger id="orm" size="sm">
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
                  <SelectTrigger id="database" size="sm">
                    <SelectValue placeholder="Choose your database" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredDatabases.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
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
                disabled={!(selectedORM && selectedDatabase) || isGenerating}
                onClick={handleGenerate}
                size="sm"
              >
                {isGenerating ? "Generating..." : "Generate"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent
            className="flex min-h-0 flex-1 flex-col space-y-4 pt-6"
            value="preview"
          >
            <div className="flex min-h-0 flex-1 flex-col space-y-2">
              <div className="flex shrink-0 items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label>Generated Code</Label>
                  {isGenerating && (
                    <div className="flex items-center gap-1 text-muted-foreground text-xs">
                      <Sparkles className="h-3 w-3 animate-pulse" />
                      <span>Generating...</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pb-2">
                  <Button
                    disabled={!generatedCode || isGenerating}
                    onClick={handleCopy}
                    size="sm"
                    variant="outline"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    disabled={!generatedCode || isGenerating}
                    onClick={handleDownload}
                    size="sm"
                    variant="outline"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border">
                <ScrollArea className="h-full w-full">
                  <div className="bg-card p-3">
                    <pre
                      className="break-word whitespace-pre-wrap font-mono text-foreground text-sm"
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
                </ScrollArea>
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
              <div className="shrink-0 rounded-lg border bg-muted/50 px-2 py-1">
                <p className="text-muted-foreground text-sm">
                  Review the generated code and make any necessary adjustments
                  before using it in your project.
                </p>
              </div>
            )}

            {isGenerating && (
              <div className="shrink-0 rounded-lg border border-primary/20 bg-primary/5 p-4">
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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
