import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo, useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Column, ForeignKeyMeta } from "@/lib/schema-transformer";

export interface TableNodeData {
  alias?: string;
  columns: Column[];
  label: string;
  schema: string;
  sourceColumns?: string[]; // columns that are sources for relationships
}

const formatForeignKeyTarget = (fk: ForeignKeyMeta) => {
  const schemaPrefix =
    fk.schema && fk.schema !== "public" ? `${fk.schema}.` : "";
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

  // Generate color based on schema name for visual grouping
  const schemaColor = useMemo(() => {
    const schema = nodeData.schema || "public";
    const colors = {
      public: {
        from: "from-background",
        to: "to-background",
        border: "border",
        shadow: "shadow-background/20",
      },
      ecommerce: {
        from: "from-emerald-600",
        to: "to-emerald-700",
        border: "border",
        shadow: "shadow-emerald-500/20",
      },
      auth: {
        from: "from-violet-500",
        to: "to-violet-600",
        border: "border-violet-500/60",
        shadow: "shadow-violet-500/20",
      },
      analytics: {
        from: "from-amber-500",
        to: "to-amber-600",
        border: "border-amber-500/60",
        shadow: "shadow-amber-500/20",
      },
      inventory: {
        from: "from-rose-500",
        to: "to-rose-600",
        border: "border-rose-500/60",
        shadow: "shadow-rose-500/20",
      },
      payment: {
        from: "from-fuchsia-500",
        to: "to-fuchsia-600",
        border: "border-fuchsia-500/60",
        shadow: "shadow-fuchsia-500/20",
      },
    };

    // Check if schema has a defined color
    if (colors[schema.toLowerCase() as keyof typeof colors]) {
      return colors[schema.toLowerCase() as keyof typeof colors];
    }

    // Generate color based on hash of schema name for consistent colors
    const hash = schema
      .split("")
      .reduce((acc, char) => char.charCodeAt(0) + acc, 0);
    const colorOptions = [
      {
        from: "from-cyan-500",
        to: "to-cyan-600",
        border: "border-cyan-500/60",
        shadow: "shadow-cyan-500/20",
      },
      {
        from: "from-pink-500",
        to: "to-pink-600",
        border: "border-pink-500/60",
        shadow: "shadow-pink-500/20",
      },
      {
        from: "from-teal-500",
        to: "to-teal-600",
        border: "border-teal-500/60",
        shadow: "shadow-teal-500/20",
      },
      {
        from: "from-orange-500",
        to: "to-orange-600",
        border: "border-orange-500/60",
        shadow: "shadow-orange-500/20",
      },
      {
        from: "from-lime-500",
        to: "to-lime-600",
        border: "border-lime-500/60",
        shadow: "shadow-lime-500/20",
      },
    ];
    return colorOptions[hash % colorOptions.length];
  }, [nodeData.schema]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className={"relative min-w-65 rounded-xl border bg-card"}>
        <div
          className={
            "flex items-center justify-between rounded-xl border-border/60 bg-background px-4 py-2 font-medium text-primary text-sm"
          }
        >
          <div className="flex items-center">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium tracking-[0.04em]">
                {nodeData.label}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {schemaTag}
              </span>
            </div>
          </div>
          <div>
            {aliasTag ? (
              <span className="rounded-full border px-2 py-0.5 font-medium text-[10px] uppercase tracking-[0.18em]">
                as {aliasTag}
              </span>
            ) : null}
          </div>
        </div>

        <div className="divide-y divide-border/60">
          {columns.map((column, index) => {
            const isPrimaryKey = Boolean(column.primaryKey);
            const foreignKeys = column.foreignKeys ?? [];
            const isForeignKey = foreignKeys.length > 0;
            const isSourceColumn = sourceColumnSet.has(column.name);

            // Simple badges without tooltips (devs know what they mean)
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

            const fkTargets = foreignKeys.map((fk) =>
              formatForeignKeyTarget(fk)
            );

            // Show enum values and FK references on hover
            const hasEnumValues =
              column.enumValues && column.enumValues.length > 0;
            const hasForeignKeys = fkTargets.length > 0;
            const hasNote = Boolean(column.note);
            const hasDefaultValue =
              column.defaultValue !== undefined && column.defaultValue !== null;
            const hasIndex = column.indexed && !isPrimaryKey;

            return (
              <div
                className="group relative flex items-center gap-3 px-4 py-1.5 text-sm transition-colors hover:bg-muted/40"
                key={`${column.name}-${index}`}
              >
                {isForeignKey ? (
                  <Handle
                    className="border! -left-3! h-2! w-2! border-primary/40! bg-primary! shadow-[0_0_0_4px_rgba(56,189,248,0.25)]! transition-transform group-hover:scale-125!"
                    id={`${id}-${column.name}-target`}
                    position={Position.Left}
                    type="target"
                  />
                ) : null}

                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground tracking-wide">
                      {column.name}
                    </span>
                    <span className="rounded bg-primary/10 px-1.5 py-px font-mono text-[10px] text-primary uppercase tracking-[0.18em]">
                      {column.type}
                    </span>
                    {column.typeDetail ? (
                      <span className="rounded bg-muted/60 px-1.5 py-px font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
                        {column.typeDetail}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-1 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
                    {badges.map((badge) => (
                      <span
                        className="inline-flex items-center rounded bg-muted/60 px-1.5 py-px"
                        key={`${column.name}-${badge}`}
                      >
                        {badge}
                      </span>
                    ))}
                    {hasIndex && (
                      <span className="inline-flex items-center rounded border border-orange-500/20 bg-orange-500/10 px-1.5 py-px text-orange-600 dark:text-orange-400">
                        IDX
                        {column.indexType && (
                          <span className="ml-1 font-normal text-[9px] lowercase opacity-70">
                            ({column.indexType})
                          </span>
                        )}
                      </span>
                    )}
                    {hasDefaultValue && (
                      <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-px font-medium text-[10px] text-cyan-600 normal-case dark:text-cyan-400">
                        default: {String(column.defaultValue)}
                      </span>
                    )}
                    {/* Show enum values on hover - inline */}
                    {hasEnumValues && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-help items-center rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-1px font-medium text-[10px] text-emerald-600 normal-case dark:text-emerald-400">
                            ENUM ({column.enumValues!.length})
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs" side="top">
                          <div className="space-y-1">
                            <p className="font-medium text-xs">Enum Values:</p>
                            <div className="flex flex-wrap gap-1">
                              {column.enumValues!.map((val, idx) => (
                                <span
                                  className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-medium text-[10px]"
                                  key={idx}
                                >
                                  {val}
                                </span>
                              ))}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {/* Show FK references on hover - inline */}
                    {hasForeignKeys && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-help items-center rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-px font-medium text-[10px] text-blue-600 normal-case dark:text-blue-400">
                            REF{" "}
                            {fkTargets.length > 1
                              ? `(${fkTargets.length})`
                              : ""}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs" side="top">
                          <div className="space-y-1">
                            <p className="font-medium text-xs">References:</p>
                            {fkTargets.map((target, idx) => (
                              <p
                                className="font-mono text-muted-foreground text-xs"
                                key={idx}
                              >
                                → {target}
                              </p>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {/* Show note on hover - inline */}
                    {hasNote && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-help items-center rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-px font-medium text-[10px] text-amber-600 normal-case dark:text-amber-400">
                            NOTE
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs" side="top">
                          <div className="space-y-1">
                            <p className="font-medium text-xs">Note:</p>
                            <p className="text-muted-foreground text-xs leading-relaxed">
                              {column.note}
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>

                {isPrimaryKey || isSourceColumn ? (
                  <Handle
                    className="border! -right-3! h-2! w-2! border-primary/40! bg-primary! shadow-[0_0_0_4px_rgba(56,189,248,0.25)]! transition-transform group-hover:scale-125!"
                    id={`${id}-${column.name}-source`}
                    position={Position.Right}
                    type="source"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
});
