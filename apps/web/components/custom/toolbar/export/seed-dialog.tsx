"use client";

import { Check, Copy, Download } from "lucide-react";
import { useMemo, useState } from "react";
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
import { generateSeed } from "@/lib/code-export";
import { useSchemaStore } from "@/store/use-schema-store";

type SeedDialect = "postgres" | "mysql";

interface ExportSeedDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ExportSeedDialog({
  open,
  onOpenChange,
}: ExportSeedDialogProps) {
  const dbml = useSchemaStore((state) => state.dbml);
  const [dialect, setDialect] = useState<SeedDialect>("postgres");
  const [copied, setCopied] = useState(false);

  const result = useMemo(
    () => (open && dbml ? generateSeed(dbml, dialect) : null),
    [open, dbml, dialect]
  );
  const sql = result?.ok ? result.sql : "";

  const handleDownload = () => {
    const blob = new Blob([sql], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seed-${dialect}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[75vh] min-w-5xl max-w-7xl flex-col overflow-hidden px-8 py-12">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle>Export seed data (SQL)</DialogTitle>
              <DialogDescription>
                INSERT statements from your records blocks, parent tables first.
                Run this after the schema SQL.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select
                onValueChange={(value) => setDialect(value as SeedDialect)}
                value={dialect}
              >
                <SelectTrigger className="w-44" id="seed-dialect" size="sm">
                  <SelectValue placeholder="Choose database" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="postgres">PostgreSQL</SelectItem>
                  <SelectItem value="mysql">MySQL</SelectItem>
                </SelectContent>
              </Select>
              <Button
                disabled={!sql}
                onClick={handleCopy}
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
                disabled={!sql}
                onClick={handleDownload}
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
              {sql ? (
                <pre className="break-word whitespace-pre-wrap font-mono text-foreground text-sm">
                  {sql}
                </pre>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {result && !result.ok
                    ? result.message
                    : "No schema to export yet. Create a schema first."}
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
