import { memo, useMemo } from "react";
import { Handle, NodeProps, Position } from "@xyflow/react";
import { Column, ForeignKeyMeta } from "@/lib/schema-transformer";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

  // Generate color based on schema name for visual grouping
  const schemaColor = useMemo(() => {
    const schema = nodeData.schema || "public";
    const colors = {
      public: {
        from: "from-emerald-600",
        to: "to-emerald-700",
        border: "border-emerald-500/60",
        shadow: "shadow-emerald-500/20",
      },
      ecommerce: {
        from: "from-emerald-600",
        to: "to-emerald-700",
        border: "border-emerald-500/60",
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
      <div
        className={`relative min-w-[260px] rounded-xl border ${schemaColor.border} bg-card/95 text-foreground shadow-[0_18px_30px_-24px_rgba(15,23,42,0.65)] ${schemaColor.shadow} backdrop-blur-sm`}
      >
        <div
          className={`flex items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r ${schemaColor.from} ${schemaColor.to} px-4 py-3 text-sm font-semibold text-primary-foreground`}
        >
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

            const fkTargets = foreignKeys.map((fk) => formatForeignKeyTarget(fk));

            // Show enum values and FK references on hover
            const hasEnumValues = column.enumValues && column.enumValues.length > 0;
            const hasForeignKeys = fkTargets.length > 0;
            const hasNote = Boolean(column.note);
            const hasDefaultValue = column.defaultValue !== undefined && column.defaultValue !== null;
            const hasIndex = column.indexed && !isPrimaryKey;

            return (
              <div
                key={`${column.name}-${index}`}
                className="group relative flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40"
              >
                {isForeignKey ? (
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`${id}-${column.name}-target`}
                    className="!h-2 !w-2 !-left-3 !bg-primary !border !border-primary/40 !shadow-[0_0_0_4px_rgba(56,189,248,0.25)] transition-transform group-hover:!scale-125"
                  />
                ) : null}

                <div className="flex flex-1 flex-col gap-1.5">
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
                    {badges.map((badge) => (
                      <span
                        key={`${column.name}-${badge}`}
                        className="inline-flex items-center rounded bg-muted/60 px-1.5 py-[1px]"
                      >
                        {badge}
                      </span>
                    ))}
                    {hasIndex && (
                      <span className="inline-flex items-center rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 px-1.5 py-[1px]">
                        IDX
                        {column.indexType && (
                          <span className="ml-1 text-[9px] font-normal lowercase opacity-70">
                            ({column.indexType})
                          </span>
                        )}
                      </span>
                    )}
                    {hasDefaultValue && (
                      <span className="rounded bg-cyan-500/10 px-1.5 py-[1px] text-[10px] font-medium normal-case text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                        default: {String(column.defaultValue)}
                      </span>
                    )}
                    {/* Show enum values on hover - inline */}
                    {hasEnumValues && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center rounded bg-emerald-500/10 px-1.5 py-[1px] text-[10px] font-medium normal-case text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 cursor-help">
                            ENUM ({column.enumValues!.length})
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="space-y-1">
                            <p className="font-semibold text-xs">Enum Values:</p>
                            <div className="flex flex-wrap gap-1">
                              {column.enumValues!.map((val, idx) => (
                                <span
                                  key={idx}
                                  className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium"
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
                          <span className="inline-flex items-center rounded bg-blue-500/10 px-1.5 py-[1px] text-[10px] font-medium normal-case text-blue-600 dark:text-blue-400 border border-blue-500/20 cursor-help">
                            REF {fkTargets.length > 1 ? `(${fkTargets.length})` : ''}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="space-y-1">
                            <p className="font-semibold text-xs">References:</p>
                            {fkTargets.map((target, idx) => (
                              <p key={idx} className="text-xs font-mono text-muted-foreground">
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
                          <span className="inline-flex items-center rounded bg-amber-500/10 px-1.5 py-[1px] text-[10px] font-medium normal-case text-amber-600 dark:text-amber-400 border border-amber-500/20 cursor-help">
                            NOTE
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="space-y-1">
                            <p className="font-semibold text-xs">Note:</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
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
    </TooltipProvider>
  );
});
