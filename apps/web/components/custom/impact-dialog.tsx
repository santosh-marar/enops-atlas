"use client";

import { analyzeImpact, type ChangeRequest } from "@enops/atlas-graph";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { analyzeDbml } from "@/lib/atlas";

interface ImpactDialogProps {
  change: ChangeRequest | null;
  dbml: string;
  onCancel: () => void;
  onConfirm: (change: ChangeRequest) => void;
}

const describe = (change: ChangeRequest) => {
  if (change.kind === "remove-table") {
    return `table ${change.schema}.${change.table}`;
  }
  if (change.kind === "remove-column") {
    return `column ${change.schema}.${change.table}.${change.column}`;
  }
  return `enum ${change.enumName}`;
};

export function ImpactDialog({
  change,
  dbml,
  onCancel,
  onConfirm,
}: ImpactDialogProps) {
  const result = useMemo(() => {
    if (!change) return null;
    try {
      const { canonical, graph } = analyzeDbml(dbml);
      return analyzeImpact(canonical, graph, change);
    } catch {
      return null;
    }
  }, [change, dbml]);

  const report = result?.ok ? result.report : null;
  const nothingAffected =
    report !== null &&
    report.affectedTables.length === 0 &&
    report.affectedColumns.length === 0 &&
    report.affectedConstraints.length === 0 &&
    report.affectedRelationships.length === 0;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      open={change !== null}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {change ? describe(change) : ""}?</DialogTitle>
          <DialogDescription>
            {result && !result.ok
              ? result.error.message
              : report?.severity === "breaking"
                ? "This is a breaking change. It affects the items below."
                : "Nothing else depends on this."}
          </DialogDescription>
        </DialogHeader>

        {report && !nothingAffected && (
          <div className="max-h-64 space-y-3 overflow-y-auto text-sm">
            {report.affectedTables.length > 0 && (
              <section>
                <p className="font-medium">Tables</p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {report.affectedTables.map((table) => (
                    <li key={table}>{table}</li>
                  ))}
                </ul>
              </section>
            )}
            {report.affectedColumns.length > 0 && (
              <section>
                <p className="font-medium">Columns</p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {report.affectedColumns.map((ref) => (
                    <li key={`${ref.table}.${ref.column}`}>
                      {ref.table}.{ref.column}: {ref.reason}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {report.affectedConstraints.length > 0 && (
              <section>
                <p className="font-medium">Constraints</p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {report.affectedConstraints.map((ref, index) => (
                    <li key={`${ref.table}-${ref.kind}-${index}`}>
                      {ref.table} ({ref.kind}): {ref.reason}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {report.notes.map((note) => (
              <p className="text-muted-foreground" key={note}>
                {note}
              </p>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!change || (result !== null && !result.ok)}
            onClick={() => change && onConfirm(change)}
            variant="destructive"
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
