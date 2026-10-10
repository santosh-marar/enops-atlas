"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { scoreDbml } from "@/lib/quality";
import { useSchemaStore } from "@/store/use-schema-store";

const tone = (percent: number) => {
  if (percent >= 80) return "text-emerald-600";
  if (percent >= 60) return "text-yellow-600";
  return "text-destructive";
};

/** Toolbar badge with the schema quality score; click for the list of hints. */
export function QualityBadge() {
  const dbml = useSchemaStore((state) => state.dbml);
  const [open, setOpen] = useState(false);
  const report = useMemo(() => scoreDbml(dbml), [dbml]);

  if (!report) return null;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        title="Schema quality hints"
        variant="ghost"
      >
        Quality <span className={tone(report.percent)}>{report.percent}%</span>
      </Button>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Schema quality:{" "}
              <span className={tone(report.percent)}>{report.percent}%</span>
            </DialogTitle>
            <DialogDescription>
              Hints, not errors. Your schema works without them.
            </DialogDescription>
          </DialogHeader>
          {report.issues.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing to suggest.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {report.issues.map((issue) => (
                <li
                  className="rounded border p-2"
                  key={`${issue.kind}-${issue.tables.join(",")}`}
                >
                  <span
                    className={`mr-2 font-medium ${issue.isWarning ? "text-yellow-600" : "text-muted-foreground"}`}
                  >
                    {issue.isWarning ? "Warning" : "Tip"}
                  </span>
                  {issue.suggestion}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
