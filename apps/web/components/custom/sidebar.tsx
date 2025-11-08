"use client";

import { Plus, FolderOpen, Github, Sparkles, Code2 } from "lucide-react";
import { IconBrandX } from "@tabler/icons-react";

interface SidebarProps {
  onNew: () => void;
  onBrowse: () => void;
  onAI: () => void;
  onToggleEditor: () => void;
  isEditorOpen: boolean;
  isAIOpen: boolean;
}

export function Sidebar({
  onNew,
  onBrowse,
  onAI,
  onToggleEditor,
  isEditorOpen,
  isAIOpen
}: SidebarProps) {
  return (
    <div className="flex h-full min-w-16 flex-col items-center border-r border-border bg-background py-4 relative z-50">
      {/* Top Section - Actions */}
      <div className="flex flex-col gap-2">
        <button
          onClick={onNew}
          className="group relative flex h-12 w-12 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent"
          title="New Project"
        >
          <Plus className="h-5 w-5 text-sidebar-foreground" />
          <span className="absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block">
            New Project
          </span>
        </button>

        <button
          onClick={onBrowse}
          className="group relative flex h-12 w-12 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent"
          title="Browse Projects"
        >
          <FolderOpen className="h-5 w-5 text-sidebar-foreground" />
          <span className="absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block">
            Browse Projects
          </span>
        </button>

        <button
          onClick={onAI}
          className={`group relative flex h-12 w-12 items-center justify-center rounded-lg transition-all ${
            isAIOpen
              ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-purple-500/50"
              : "hover:bg-sidebar-accent"
          }`}
          title="AI Schema Assistant"
        >
          <Sparkles className={`h-5 w-5 ${isAIOpen ? "" : "text-sidebar-foreground"}`} />
          <span className="absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block">
            AI Assistant
          </span>
        </button>

        <div className="h-px bg-border my-2" />

        <button
          onClick={onToggleEditor}
          className={`group relative flex h-12 w-12 items-center justify-center rounded-lg transition-all ${
            isEditorOpen
              ? "bg-primary text-primary-foreground shadow-md"
              : "hover:bg-sidebar-accent"
          }`}
          title="Toggle Editor"
        >
          <Code2 className="h-5 w-5" />
          <span className="absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block">
            Editor
          </span>
        </button>
      </div>

      {/* Bottom Section - Social Links */}
      <div className="mt-auto flex flex-col gap-2">
        <a
          href="https://github.com/santosh-marar/enops.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex h-12 w-12 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent"
          title="GitHub"
        >
          <Github className="h-5 w-5 text-sidebar-foreground" />
          <span className="absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block">
            GitHub
          </span>
        </a>

        <a
          href="https://x.com/santosh_marar"
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex h-12 w-12 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent"
          title="X (Twitter)"
        >
          <IconBrandX className="h-5 w-5 text-sidebar-foreground" />
          <span className="absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block">
             (Twitter)
          </span>
        </a>
      </div>
    </div>
  );
}
