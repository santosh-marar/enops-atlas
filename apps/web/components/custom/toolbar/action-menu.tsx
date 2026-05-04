import {
  ChevronDown,
  Code2,
  Database,
  Download,
  FolderOpen,
  ImageIcon,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface ActionMenuProps {
  hasCurrentProject: boolean;
  onBrowse: () => void;
  onDelete: () => void;
  onExport: (format: "png" | "jpeg" | "svg") => void;
  onExportSchema?: () => void;
  onImportDb?: () => void;
  onNew: () => void;
}

export function ActionMenu({
  onNew,
  onBrowse,
  onDelete,
  onExport,
  onExportSchema,
  onImportDb,
  hasCurrentProject,
}: ActionMenuProps) {
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        actionMenuRef.current &&
        !actionMenuRef.current.contains(event.target as Node)
      ) {
        setShowActionMenu(false);
      }
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setShowExportMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleExport = (format: "png" | "jpeg" | "svg") => {
    onExport(format);
    setShowExportMenu(false);
    setShowActionMenu(false);
  };

  return (
    <div className="relative" ref={actionMenuRef}>
      <Button
        onClick={() => setShowActionMenu(!showActionMenu)}
        size={"sm"}
        variant={"ghost"}
      >
        <ChevronDown className="h-4 w-4" />
        Action
      </Button>

      {showActionMenu && (
        <div className="absolute top-full left-0 z-50 mt-1 w-48 rounded-md border border-border bg-card shadow-lg">
          <button
            className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
            onClick={() => {
              onNew();
              setShowActionMenu(false);
            }}
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
          <button
            className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
            onClick={onBrowse}
          >
            <FolderOpen className="h-4 w-4" />
            Browse Projects
          </button>
          <button
            className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
            onClick={() => {
              onImportDb?.();
              setShowActionMenu(false);
            }}
          >
            <Database className="h-4 w-4" />
            Import DB
          </button>
          <button
            className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasCurrentProject}
            onClick={() => {
              onDelete();
              setShowActionMenu(false);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete Project
          </button>
          <div className="h-px bg-border" />
          <div className="relative">
            <button
              className="flex w-full items-center justify-between gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
              onClick={() => setShowExportMenu(!showExportMenu)}
            >
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Export
              </div>
              <ChevronDown className="h-4 w-4" />
            </button>

            {showExportMenu && (
              <div
                className="absolute top-0 left-full ml-1 w-56 rounded-md border border-border bg-card shadow-lg"
                ref={exportMenuRef}
              >
                <div className="px-2 py-1 font-semibold text-muted-foreground text-xs">
                  Export Diagram
                </div>
                <button
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
                  onClick={() => handleExport("png")}
                >
                  <ImageIcon className="h-4 w-4" />
                  Export as PNG
                </button>
                <button
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
                  onClick={() => handleExport("jpeg")}
                >
                  <ImageIcon className="h-4 w-4" />
                  Export as JPEG
                </button>
                <button
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
                  onClick={() => handleExport("svg")}
                >
                  <ImageIcon className="h-4 w-4" />
                  Export as SVG
                </button>
                <div className="my-1 h-px bg-border" />
                <div className="px-2 py-1 font-semibold text-muted-foreground text-xs">
                  Export Schema
                </div>
                <button
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
                  onClick={() => {
                    onExportSchema?.();
                    setShowExportMenu(false);
                    setShowActionMenu(false);
                  }}
                >
                  <Code2 className="h-4 w-4" />
                  Export for ORM/DB
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
