"use client";

import { IconBrandX } from "@tabler/icons-react";
import { Code2, FolderOpen, Github, Plus, Sparkles } from "lucide-react";

interface SidebarProps {
  isAIOpen: boolean;
  isEditorOpen: boolean;
  onAI: () => void;
  onBrowse: () => void;
  onNew: () => void;
  onToggleEditor: () => void;
}

export function Sidebar({
  onNew,
  onBrowse,
  onAI,
  onToggleEditor,
  isEditorOpen,
  isAIOpen,
}: SidebarProps) {
  return (
    <div className="relative z-50 flex h-full min-w-16 flex-col items-center bg-background py-4">
      {/* Top Section - Actions */}
      <div className="flex flex-col gap-2">
        <button
          className="group relative flex h-12 w-12 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent"
          onClick={onNew}
          title="New Project"
        >
          <Plus className="h-5 w-5 text-sidebar-foreground" />
          <span className="absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-popover px-2 py-1 text-popover-foreground text-xs shadow-md group-hover:block">
            New Project
          </span>
        </button>

        <button
          className="group relative flex h-12 w-12 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent"
          onClick={onBrowse}
          title="Browse Projects"
        >
          <FolderOpen className="h-5 w-5 text-sidebar-foreground" />
          <span className="absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-popover px-2 py-1 text-popover-foreground text-xs shadow-md group-hover:block">
            Browse Projects
          </span>
        </button>

        <div className="my-2 h-px bg-border" />

        <button
          className={`group relative flex h-12 w-12 items-center justify-center rounded-lg transition-all ${
            isAIOpen
              ? "bg-linear-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-purple-500/50"
              : "hover:bg-sidebar-accent"
          }`}
          onClick={onAI}
          title="AI Schema Assistant"
        >
          <Sparkles
            className={`h-5 w-5 ${isAIOpen ? "" : "text-sidebar-foreground"}`}
          />
          <span className="absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-popover px-2 py-1 text-popover-foreground text-xs shadow-md group-hover:block">
            AI Assistant
          </span>
        </button>

        <button
          className={`group relative flex h-12 w-12 items-center justify-center rounded-lg transition-all ${
            isEditorOpen
              ? "bg-primary text-primary-foreground shadow-md"
              : "hover:bg-sidebar-accent"
          }`}
          onClick={onToggleEditor}
          title="Toggle Editor"
        >
          <Code2 className="h-5 w-5" />
          <span className="absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-popover px-2 py-1 text-popover-foreground text-xs shadow-md group-hover:block">
            Editor
          </span>
        </button>
      </div>

      {/* Bottom Section - Social Links */}
      <div className="mt-auto flex flex-col gap-2">
        <a
          className="group relative flex h-12 w-12 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent"
          href="https://github.com/santosh-marar/enops.dev"
          rel="noopener noreferrer"
          target="_blank"
          title="GitHub"
        >
          <Github className="h-5 w-5 text-sidebar-foreground" />
          <span className="absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-popover px-2 py-1 text-popover-foreground text-xs shadow-md group-hover:block">
            GitHub
          </span>
        </a>

        <a
          className="group relative flex h-12 w-12 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent"
          href="https://x.com/santosh_marar"
          rel="noopener noreferrer"
          target="_blank"
          title="X (Twitter)"
        >
          <IconBrandX className="h-5 w-5 text-sidebar-foreground" />
          <span className="absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-popover px-2 py-1 text-popover-foreground text-xs shadow-md group-hover:block">
            (Twitter)
          </span>
        </a>
      </div>
    </div>
  );
}
