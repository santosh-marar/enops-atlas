"use client";

import { Panel, useReactFlow, useStore } from "@xyflow/react";
import { AlertTriangle, X } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { useSchemaStore } from "@/store/use-schema-store";

const WARNINGS_HIDDEN_KEY = "atlas-warnings-hidden";

/** Whether the warnings panel is hidden, remembered in this browser. */
function useWarningsHidden() {
  const [hidden, setHidden] = useState(false);
  // Read after mounting, so the server and first client render agree.
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(WARNINGS_HIDDEN_KEY) === "1");
    } catch {
      // Shown by default.
    }
  }, []);
  const update = (next: boolean) => {
    setHidden(next);
    try {
      localStorage.setItem(WARNINGS_HIDDEN_KEY, next ? "1" : "0");
    } catch {
      // The choice just isn't remembered.
    }
  };
  return [hidden, update] as const;
}

export const FlowToolbar = memo(function FlowToolbar() {
  const { canUndo, canRedo, undo, redo, warnings, isLocked, toggleLock } =
    useSchemaStore();

  const [warningsHidden, setWarningsHidden] = useWarningsHidden();
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) {
          undo();
        }
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z") ||
        ((e.ctrlKey || e.metaKey) && e.key === "y")
      ) {
        e.preventDefault();
        if (canRedo) {
          redo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  return (
    <>
      <Panel
        className="flex gap-2 rounded-lg border border-border/60 bg-card/90 p-2 shadow-lg backdrop-blur-sm"
        position="bottom-center"
      >
        <button
          className="rounded-md bg-background px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-muted"
          onClick={() => zoomIn()}
          title="Zoom In"
        >
          +
        </button>

        <div className="flex items-center rounded-md bg-background px-3 py-1.5 font-medium text-foreground text-xs">
          {Math.round(zoom * 100)}%
        </div>

        <button
          className="rounded-md bg-background px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-muted"
          onClick={() => zoomOut()}
          title="Zoom Out"
        >
          −
        </button>

        <button
          className="rounded-md bg-background px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-muted"
          onClick={() => fitView()}
          title="Fit View"
        >
          ⊡
        </button>

        <div className="mx-1 w-px bg-border" />

        <button
          className={`rounded-md px-3 py-1.5 font-medium text-xs transition-colors hover:bg-muted ${
            isLocked
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-background text-foreground"
          }`}
          onClick={toggleLock}
          title={
            isLocked ? "Unlock (Enable Dragging)" : "Lock (Disable Dragging)"
          }
        >
          {isLocked ? "🔒" : "🔓"}
        </button>

        <div className="mx-1 w-px bg-border" />

        <button
          className="rounded-md bg-background px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canUndo}
          onClick={undo}
          title="Undo (Ctrl+Z)"
        >
          ↶ Undo
        </button>

        <button
          className="rounded-md bg-background px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canRedo}
          onClick={redo}
          title="Redo (Ctrl+Shift+Z)"
        >
          ↷ Redo
        </button>
      </Panel>

      {warnings.length > 0 && warningsHidden && (
        <Panel position="bottom-left">
          <button
            className="flex items-center gap-1.5 rounded-lg border border-warning/60 bg-warning/10 px-2.5 py-1.5 font-medium text-warning text-xs shadow-lg backdrop-blur-sm hover:bg-warning/20"
            onClick={() => setWarningsHidden(false)}
            title="Show warnings"
            type="button"
          >
            <AlertTriangle className="size-3.5" />
            {warnings.length}
          </button>
        </Panel>
      )}

      {warnings.length > 0 && !warningsHidden && (
        <Panel
          className="max-w-md rounded-lg border border-warning/60 bg-warning/10 p-3 shadow-lg backdrop-blur-sm"
          position="bottom-left"
        >
          <div className="mb-2 flex items-center gap-2 font-semibold text-sm text-warning">
            Warnings ({warnings.length})
            <button
              className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
              onClick={() => setWarningsHidden(true)}
              title="Hide warnings"
              type="button"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="max-h-32 space-y-1 overflow-y-auto text-muted-foreground text-xs">
            {warnings.slice(0, 5).map((warning, idx) => (
              <div className="rounded bg-background/50 p-1.5" key={idx}>
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
