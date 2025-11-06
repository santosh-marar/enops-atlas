import { memo, useMemo } from "react";
import { Handle, NodeProps, Position } from "@xyflow/react";
import { Column, ForeignKeyMeta } from "@/lib/schema-transformer";

export interface TableNodeData {
  label: string;
  schema: string;
  alias?: string;
  columns: Column[];
  sourceColumns?: string[]; // columns that are sources for relationships
}

const formatForeignKeyTarget = (fk: ForeignKeyMeta) => {
  const schemaPrefix = fk.schema && fk.schema !== "public" ? `${fk.schema}.` : "";
  return `${schemaPrefix}${fk.table}.${fk.column}`;
};

export const TableNode = memo(function TableNode({ data, id }: NodeProps) {
  const nodeData = data as unknown as TableNodeData;

  const schemaTag = useMemo(
    () =>
      nodeData.schema && nodeData.schema !== "public"
        ? nodeData.schema.toUpperCase()
        : "PUBLIC",
    [nodeData.schema]
  );

  const aliasTag = useMemo(
    () =>
      nodeData.alias && nodeData.alias !== nodeData.label
        ? nodeData.alias.toUpperCase()
        : null,
    [nodeData.alias, nodeData.label]
  );

  const columns = useMemo(() => nodeData.columns ?? [], [nodeData.columns]);
  const sourceColumnSet = useMemo(
    () => new Set(nodeData.sourceColumns ?? []),
    [nodeData.sourceColumns]
  );

  return (
    <div className="relative min-w-[260px] overflow-hidden rounded-xl border border-border/60 bg-card/95 text-foreground shadow-[0_18px_30px_-24px_rgba(15,23,42,0.65)] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-primary to-primary/70 px-4 py-3 text-sm font-semibold text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary-foreground/70">
              {schemaTag}
            </span>
            <span className="text-[15px] font-semibold tracking-[0.04em]">
              {nodeData.label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {aliasTag ? (
            <span className="rounded-full border border-primary-foreground/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em]">
              AS {aliasTag}
            </span>
          ) : null}
          <span className="rounded-full border border-primary-foreground/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em]">
            TABLE
          </span>
        </div>
      </div>

      <div className="divide-y divide-border/60">
        {columns.map((column, index) => {
          const isPrimaryKey = Boolean(column.primaryKey);
          const foreignKeys = column.foreignKeys ?? [];
          const isForeignKey = foreignKeys.length > 0;
          const isSourceColumn = sourceColumnSet.has(column.name); // Column is referenced by a relationship

          const badges: string[] = [];
          if (isPrimaryKey) {
            badges.push("PK");
          }
          if (isForeignKey) {
            badges.push("FK");
          }
          if (column.unique && !isPrimaryKey) {
            badges.push("UQ");
          }
          if (column.autoIncrement) {
            badges.push("AI");
          }
          if (column.nullable === false) {
            badges.push("NN");
          }

          const fkTargets = foreignKeys.map((fk) => formatForeignKeyTarget(fk));

          return (
            <div
              key={`${column.name}-${index}`}
              className="group relative flex items-start gap-3 px-4 py-2 text-sm transition-colors hover:bg-muted/40"
            >
              {isForeignKey ? (
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`${id}-${column.name}-target`}
                  className="!h-2 !w-2 !-left-3 !bg-primary !border !border-primary/40 !shadow-[0_0_0_4px_rgba(56,189,248,0.25)] transition-transform group-hover:!scale-125"
                />
              ) : null}

              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium tracking-wide text-foreground">
                    {column.name}
                  </span>
                  <span className="rounded bg-primary/10 px-1.5 py-[1px] text-[10px] font-mono uppercase tracking-[0.18em] text-primary">
                    {column.type}
                  </span>
                  {column.typeDetail ? (
                    <span className="rounded bg-muted/60 px-1.5 py-[1px] text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                      {column.typeDetail}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {badges.length > 0
                    ? badges.map((badge) => (
                        <span
                          key={`${column.name}-${badge}`}
                          className="inline-flex items-center rounded bg-muted/60 px-1.5 py-[1px]"
                        >
                          {badge}
                        </span>
                      ))
                    : null}
                  {fkTargets.length > 0 ? (
                    <span className="ml-1 text-[10px] font-medium normal-case tracking-tight text-muted-foreground">
                      FK → {fkTargets.join(", ")}
                    </span>
                  ) : null}
                </div>
              </div>

              {(isPrimaryKey || isSourceColumn) ? (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`${id}-${column.name}-source`}
                  className="!h-2 !w-2 !-right-3 !bg-primary !border !border-primary/40 !shadow-[0_0_0_4px_rgba(56,189,248,0.25)] transition-transform group-hover:!scale-125"
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
    </div>
  );
});
