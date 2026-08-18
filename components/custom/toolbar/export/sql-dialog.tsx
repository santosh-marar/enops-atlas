"use client";

import { ModelExporter, Parser } from "@dbml/core";
import { Check, Copy, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSchemaStore } from "@/store/use-schema-store";
import { type SQLDialect, sqlDatabases } from "./sql-databases";

interface ExportSQLDialogProps {
  dialect: SQLDialect;
  onDialectChange: (dialect: SQLDialect) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ExportSQLDialog({
  open,
  onOpenChange,
  dialect,
  onDialectChange,
}: ExportSQLDialogProps) {
  const { dbml } = useSchemaStore();
  const [generatedSQL, setGeneratedSQL] = useState("");
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = (targetDialect: SQLDialect) => {
    if (!dbml) {
      toast.error("No schema to export. Please create a schema first.");
      return;
    }

    setIsGenerating(true);
    try {
      const model = new Parser().parse(dbml, "dbmlv2");
      const sql = ModelExporter.export(model, targetDialect);
      setGeneratedSQL(sql);
    } catch (error: any) {
      toast.error(error.message || "Failed to generate SQL");
      setGeneratedSQL("");
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (open) {
      generate(dialect);
    }
  }, [open, dialect]);

  const handleDownloadSQL = () => {
    const blob = new Blob([generatedSQL], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schema-${dialect}.sql`;
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

  const currentLabel = sqlDatabases.find((d) => d.value === dialect)?.label;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[75vh] min-w-5xl max-w-7xl flex-col overflow-hidden px-8 py-12">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle>Export as SQL — {currentLabel}</DialogTitle>
              <DialogDescription>
                Raw SQL DDL generated from your schema.
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2">
              <Select
                onValueChange={(value) => onDialectChange(value as SQLDialect)}
                value={dialect}
              >
                <SelectTrigger className="w-44" id="sql-dialect" size="sm">
                  <SelectValue placeholder="Choose database" />
                </SelectTrigger>
                <SelectContent>
                  {sqlDatabases.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                disabled={!generatedSQL}
                onClick={handleCopySQL}
                size="icon-sm"
                title={copied ? "Copied!" : "Copy"}
                variant="outline"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
              </Button>
              <Button
                disabled={!generatedSQL}
                onClick={handleDownloadSQL}
                size="icon-sm"
                title="Download"
                variant="outline"
              >
                <Download className="h-4 w-4" />
                <span className="sr-only">Download</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
          <ScrollArea className="h-full">
            <div className="bg-card p-4">
              {isGenerating ? (
                <p className="text-muted-foreground text-sm">Generating...</p>
              ) : generatedSQL ? (
                <pre className="break-word whitespace-pre-wrap font-mono text-foreground text-sm">
                  {generatedSQL}
                </pre>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No schema to export yet. Create a schema first.
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
