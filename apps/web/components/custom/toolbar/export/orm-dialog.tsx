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
import { generateCode } from "@/lib/code-export";
import { useSchemaStore } from "@/store/use-schema-store";

export type OrmFormat = "prisma" | "drizzle";

const ormFormats: { extension: string; label: string; value: OrmFormat }[] = [
  { extension: "prisma", label: "Prisma", value: "prisma" },
  { extension: "ts", label: "Drizzle ORM", value: "drizzle" },
];

interface ExportORMDialogProps {
  format: OrmFormat;
  onFormatChange: (format: OrmFormat) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ExportORMDialog({
  open,
  onOpenChange,
  format,
  onFormatChange,
}: ExportORMDialogProps) {
  const dbml = useSchemaStore((state) => state.dbml);
  const [copied, setCopied] = useState(false);

  // Same input, same output: generated on demand, no AI and no waiting.
  const result = useMemo(
    () => (open && dbml ? generateCode(dbml, format) : null),
    [open, dbml, format]
  );
  const code = result?.ok ? result.code : "";
  const current = ormFormats.find((option) => option.value === format);

  const handleDownload = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schema.${current?.extension ?? "txt"}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[75vh] min-w-5xl max-w-7xl flex-col overflow-hidden px-8 py-12">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle>Export as ORM — {current?.label}</DialogTitle>
              <DialogDescription>
                Generated directly from your schema. The same schema always
                gives the same code.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select
                onValueChange={(value) => onFormatChange(value as OrmFormat)}
                value={format}
              >
                <SelectTrigger className="w-44" id="orm-format" size="sm">
                  <SelectValue placeholder="Choose ORM" />
                </SelectTrigger>
                <SelectContent>
                  {ormFormats.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!code}
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
                disabled={!code}
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
              {code ? (
                <pre className="break-word whitespace-pre-wrap font-mono text-foreground text-sm">
                  {code}
                </pre>
              ) : result && !result.ok ? (
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-destructive">
                    This schema can't be exported as {current?.label} yet:
                  </p>
                  <ul className="list-inside list-disc text-muted-foreground">
                    {result.messages.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground">
                    Nothing is guessed. Fix the points above, or use "Other ORMs
                    (AI)" from the Export menu.
                  </p>
                </div>
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
