"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { SchemaVersion } from "@/lib/db";
import { checkMigration, describeChange } from "@/lib/schema-history";
import { listVersions } from "@/lib/versions";

interface HistoryDialogProps {
  dbml: string;
  onOpenChange: (open: boolean) => void;
  onRestore: (dbml: string) => Promise<void>;
  open: boolean;
  projectId: string | null;
}

const List = ({ items, title }: { items: string[]; title: string }) =>
  items.length > 0 ? (
    <section>
      <p className="font-medium">{title}</p>
      <ul className="list-inside list-disc text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  ) : null;

export function HistoryDialog({
  open,
  onOpenChange,
  projectId,
  dbml,
  onRestore,
}: HistoryDialogProps) {
  const [versions, setVersions] = useState<SchemaVersion[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sql, setSql] = useState("");

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const list = await listVersions(projectId);
    setVersions(list);
    setSelected((current) => current ?? list[0]?.id ?? null);
  }, [projectId]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // The selected version compared with the one before it (versions are newest first).
  const change = useMemo(() => {
    const index = versions.findIndex((version) => version.id === selected);
    const version = versions[index];
    if (!version) return null;
    const previous = versions[index + 1];
    try {
      return describeChange(previous?.dbml ?? "", version.dbml);
    } catch {
      return null;
    }
  }, [versions, selected]);

  const migration = useMemo(
    () => (sql.trim() ? checkMigration(sql) : null),
    [sql]
  );
  const chosen = versions.find((version) => version.id === selected);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[85vh] min-w-3xl flex-col gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            {projectId
              ? "Saved versions of this project, and a check for migrations that lose data. Save one from Action > New Version."
              : "Save the project first. History is kept per project."}
          </DialogDescription>
        </DialogHeader>

        {projectId && (
          <div className="grid grid-cols-[14rem_1fr] gap-4">
            <div className="flex flex-col gap-2">
              <ul className="max-h-64 overflow-y-auto text-sm">
                {versions.length === 0 && (
                  <li className="text-muted-foreground">No versions yet.</li>
                )}
                {versions.map((version) => (
                  <li key={version.id}>
                    <button
                      className={`w-full rounded px-2 py-1 text-left hover:bg-muted ${
                        version.id === selected ? "bg-muted" : ""
                      }`}
                      onClick={() => setSelected(version.id)}
                      type="button"
                    >
                      <span className="font-medium">v{version.number}</span>
                      {version.label && <span> · {version.label}</span>}
                      <span className="block text-muted-foreground text-xs">
                        {version.createdAt.toLocaleString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3 text-sm">
              {change?.isEmpty && (
                <p className="text-muted-foreground">
                  No changes in this version.
                </p>
              )}
              {change && !change.isEmpty && (
                <>
                  <List items={change.addedTables} title="Tables added" />
                  <List items={change.removedTables} title="Tables removed" />
                  <List
                    items={change.modifiedColumns}
                    title="Columns changed"
                  />
                  <List
                    items={change.changes
                      .filter((item) => item.reviewRequired)
                      .map((item) => `${item.object} (${item.change})`)}
                    title="Needs review"
                  />
                </>
              )}
              {chosen && (
                <p className="font-medium">
                  v{chosen.number}
                  {chosen.label && ` · ${chosen.label}`}
                </p>
              )}
              {chosen && (
                <Button
                  onClick={async () => {
                    await onRestore(chosen.dbml);
                    onOpenChange(false);
                  }}
                  size="sm"
                  variant="outline"
                >
                  Restore this version
                </Button>
              )}
            </div>
          </div>
        )}

        <section className="space-y-2 border-t pt-3">
          <p className="font-medium text-sm">Check a migration</p>
          <Textarea
            className="h-24 font-mono text-xs"
            onChange={(event) => setSql(event.target.value)}
            placeholder="Paste migration SQL to see if it can lose data..."
            value={sql}
          />
          {migration && (
            <div className="text-sm">
              <p
                className={
                  migration.destructive
                    ? "text-destructive"
                    : "text-muted-foreground"
                }
              >
                {migration.destructive
                  ? `This migration can lose data (${migration.findings.length} finding${migration.findings.length === 1 ? "" : "s"}).`
                  : `No data-losing statements found in ${migration.statements} statement${migration.statements === 1 ? "" : "s"}.`}
              </p>
              <ul className="list-inside list-disc text-muted-foreground">
                {migration.findings.map((finding) => (
                  <li key={finding.statement}>
                    {finding.reason}: <code>{finding.statement}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
