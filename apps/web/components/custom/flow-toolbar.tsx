"use client";

import { memo, useEffect } from "react";
import { useSchemaStore } from "@/store/use-schema-store";
import { Panel, useReactFlow, useStore } from "@xyflow/react";

export const FlowToolbar = memo(function FlowToolbar() {
  const { canUndo, canRedo, undo, redo, warnings, isLocked, toggleLock } =
    useSchemaStore();

  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z") ||
        ((e.ctrlKey || e.metaKey) && e.key === "y")
      ) {
        e.preventDefault();
        if (canRedo) redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  return (
    <>
      <Panel
        position="bottom-center"
        className="flex gap-2 rounded-lg border border-border/60 bg-card/90 p-2 shadow-lg backdrop-blur-sm"
      >
        <button
          onClick={() => zoomIn()}
          className="rounded-md bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          title="Zoom In"
        >
          +
        </button>

        <div className="flex items-center rounded-md bg-background px-3 py-1.5 text-xs font-medium text-foreground">
          {Math.round(zoom * 100)}%
        </div>

        <button
          onClick={() => zoomOut()}
          className="rounded-md bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          title="Zoom Out"
        >
          −
        </button>

        <button
          onClick={() => fitView()}
          className="rounded-md bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          title="Fit View"
        >
          ⊡
        </button>

        <div className="mx-1 w-px bg-border" />

        <button
          onClick={toggleLock}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted ${
            isLocked
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-background text-foreground"
          }`}
          title={
            isLocked ? "Unlock (Enable Dragging)" : "Lock (Disable Dragging)"
          }
        >
          {isLocked ? "🔒" : "🔓"}
        </button>

        <div className="mx-1 w-px bg-border" />

        <button
          onClick={undo}
          disabled={!canUndo}
          className="rounded-md bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          title="Undo (Ctrl+Z)"
        >
          ↶ Undo
        </button>

        <button
          onClick={redo}
          disabled={!canRedo}
          className="rounded-md bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          title="Redo (Ctrl+Shift+Z)"
        >
          ↷ Redo
        </button>
      </Panel>

      {warnings.length > 0 && (
        <Panel
          position="bottom-left"
          className="max-w-md rounded-lg border border-warning/60 bg-warning/10 p-3 shadow-lg backdrop-blur-sm"
        >
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning">
            Warnings ({warnings.length})
          </div>
          <div className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
            {warnings.slice(0, 5).map((warning, idx) => (
              <div key={idx} className="rounded bg-background/50 p-1.5">
                <div className="font-medium">{warning.message}</div>
                {warning.context && (
                  <div className="text-[10px] opacity-70">
                    {warning.context}
                  </div>
                )}
              </div>
            ))}
            {warnings.length > 5 && (
              <div className="pt-1 text-center text-[10px] opacity-60">
                +{warnings.length - 5} more warnings
              </div>
            )}
          </div>
        </Panel>
      )}
    </>
  );
});
