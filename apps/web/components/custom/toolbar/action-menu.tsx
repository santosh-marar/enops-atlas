import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  Plus,
  FolderOpen,
  Trash2,
  Download,
  ImageIcon,
} from "lucide-react";

interface ActionMenuProps {
  onNew: () => void;
  onBrowse: () => void;
  onDelete: () => void;
  onExport: (format: "png" | "jpeg" | "svg") => void;
  hasCurrentProject: boolean;
}

export function ActionMenu({
  onNew,
  onBrowse,
  onDelete,
  onExport,
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
      <button
        onClick={() => setShowActionMenu(!showActionMenu)}
        className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
      >
        Action
        <ChevronDown className="h-4 w-4" />
      </button>

      {showActionMenu && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-md border border-border bg-card shadow-lg">
          <button
            onClick={() => {
              onNew();
              setShowActionMenu(false);
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
          <button
            onClick={() => {
              onBrowse();
              setShowActionMenu(false);
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
          >
            <FolderOpen className="h-4 w-4" />
            Browse Projects
          </button>
          <button
            onClick={() => {
              onDelete();
              setShowActionMenu(false);
            }}
            disabled={!hasCurrentProject}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete Project
          </button>
          <div className="h-px bg-border" />
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex w-full items-center justify-between gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
            >
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Export
              </div>
              <ChevronDown className="h-4 w-4" />
            </button>

            {showExportMenu && (
              <div
                className="absolute left-full top-0 ml-1 w-48 rounded-md border border-border bg-card shadow-lg"
                ref={exportMenuRef}
              >
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                  Export Diagram
                </div>
                <button
                  onClick={() => handleExport("png")}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
                >
                  <ImageIcon className="h-4 w-4" />
                  Export as PNG
                </button>
                <button
                  onClick={() => handleExport("jpeg")}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
                >
                  <ImageIcon className="h-4 w-4" />
                  Export as JPEG
                </button>
                <button
                  onClick={() => handleExport("svg")}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
                >
                  <ImageIcon className="h-4 w-4" />
                  Export as SVG
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
