"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSchemaStore } from "@/store/use-schema-store";
import {
  FileText,
  Save,
  Download,
  FolderOpen,
  Trash2,
  Plus,
  Github,
  HelpCircle,
  ChevronDown,
  Image as ImageIcon,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

// Lazy load heavy dependencies
const loadImageExport = () => import("html-to-image");

interface TopToolbarProps {
  flowContainerRef?: React.RefObject<HTMLDivElement | null>;
}

interface Project {
  id?: number;
  name: string;
  dbml: string;
  nodes?: any[];
  edges?: any[];
  createdAt: Date;
  updatedAt: Date;
}

export function TopToolbar({ flowContainerRef }: TopToolbarProps) {
  const { dbml, nodes, edges, updateFromDBML, setNodes, setEdges } = useSchemaStore();
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [projectName, setProjectName] = useState("Untitled Project");
  const [isEditingName, setIsEditingName] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showProjectBrowser, setShowProjectBrowser] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);


  // Auto-save with debouncing - only when dbml changes
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [dbml, currentProject]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setShowActionMenu(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNew = async () => {
    if (dbml && dbml.trim().length > 0) {
      setShowNewProjectDialog(true);
      return;
    }

    try {
      setCurrentProject(null);
      setProjectName("Untitled Project");
      setLastSaved(null);
      await updateFromDBML("");
      toast.success("New project created successfully!");
    } catch (error) {
      toast.error("Failed to create new project. Please try again.");
    }
    setShowActionMenu(false);
  };

  const handleBrowse = async () => {
    setShowProjectBrowser(true);
    setShowActionMenu(false);
  };

  const handleOpenProject = async (project: Project) => {
    try {
      setCurrentProject(project);
      setProjectName(project.name);
      setLastSaved(project.updatedAt);

      // If project has saved nodes, restore them first
      if (project.nodes && project.nodes.length > 0) {
        setNodes(project.nodes);
      }
      if (project.edges && project.edges.length > 0) {
        setEdges(project.edges);
      }

      // Update the store which will preserve positions if nodes exist
      await updateFromDBML(project.dbml || "", project.nodes && project.nodes.length > 0);

      setShowProjectBrowser(false);
    } catch (error) {
      toast.error("Failed to open project. Please try again.");
    }
  };

  const handleExportSQL = () => {
    const { sql } = useSchemaStore.getState();
    if (!sql) {
      toast.error("No SQL to export. Please add DBML schema first.");
      return;
    }

    const blob = new Blob([sql], { type: "text/sql" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, "_")}_postgres.sql`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleExportImage = async (format: "png" | "jpeg" | "svg") => {
    if (!flowContainerRef?.current) {
      toast.error("Flow diagram not found");
      return;
    }

    if (isExporting) return;

    setIsExporting(true);
    setShowExportMenu(false);

    // Use requestAnimationFrame twice to ensure the UI fully updates
    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        try {
          const imageLib = await loadImageExport();
          const { toPng, toJpeg, toSvg } = imageLib;
          const element = flowContainerRef.current;
          if (!element) {
            setIsExporting(false);
            return;
          }

          let dataUrl: string;

          if (format === "png") {
            dataUrl = await toPng(element, {
              quality: 1.0,
              pixelRatio: 2,
              cacheBust: true
            });
          } else if (format === "jpeg") {
            dataUrl = await toJpeg(element, {
              quality: 0.95,
              pixelRatio: 2,
              cacheBust: true
            });
          } else {
            dataUrl = await toSvg(element, { cacheBust: true });
          }

          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = `${projectName.replace(/\s+/g, "_")}_diagram.${format}`;
          a.click();
        } catch (error) {
          toast.error("Failed to export image. Please try again.");
        } finally {
          setIsExporting(false);
        }
      });
    });
  };

  const formatLastSaved = () => {
    if (!lastSaved) return "Never";
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastSaved.getTime()) / 1000);

    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return lastSaved.toLocaleDateString();
  };

  return (
    <>
      {/* Export Loading Overlay */}
      {isExporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-lg border border-border bg-card p-6 shadow-lg">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <div className="font-semibold">Exporting Diagram...</div>
                <div className="text-sm text-muted-foreground">
                  This may take a few seconds
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex h-12 items-center justify-between border-b border-border bg-card px-4 shadow-sm">
        {/* Left Section */}
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <Image
              src="/logo.png"
              alt="Enops.dev Logo"
              width={48}
              height={48}
              className="rounded-full"
            />{" "}
            <span className="text-sm font-bold">Enops.dev</span>
          </div>

          {/* Action Dropdown */}
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
                  onClick={handleNew}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                  New Project
                </button>
                <button
                  onClick={handleBrowse}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
                >
                  <FolderOpen className="h-4 w-4" />
                  Browse Projects
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
                      <button
                        onClick={handleExportSQL}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
                      >
                        <FileText className="h-4 w-4" />
                        Export SQL (PostgreSQL)
                      </button>
                      <div className="h-px bg-border" />
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                        Export Diagram
                      </div>
                      <button
                        onClick={() => handleExportImage("png")}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
                      >
                        <ImageIcon className="h-4 w-4" />
                        Export as PNG
                      </button>
                      <button
                        onClick={() => handleExportImage("jpeg")}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted"
                      >
                        <ImageIcon className="h-4 w-4" />
                        Export as JPEG
                      </button>
                      <button
                        onClick={() => handleExportImage("svg")}
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

          <a
            href="https://github.com/santosh-marar/enops.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <HelpCircle className="h-4 w-4" />
            Help
          </a>
        </div>

        {/* Middle Section - Project Name */}
        <div className="flex-1 text-center">
          {isEditingName ? (
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={() => setIsEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setIsEditingName(false);
              }}
              className="rounded-md border border-border bg-background px-3 py-1 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setIsEditingName(true)}
              className="rounded-md px-3 py-1 text-sm font-medium transition-colors hover:bg-muted"
            >
              {projectName}
            </button>
          )}
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/santosh-marar/enops.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Github className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Project Browser Modal */}
      {showProjectBrowser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Browse Projects</h2>
              <button
                onClick={() => setShowProjectBrowser(false)}
                className="rounded-md p-1 transition-colors hover:bg-muted"
              >
                ✕
              </button>
            </div>

            <div className="max-h-96 space-y-2 overflow-y-auto">
              {projects.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No projects found. Create your first project!
                </p>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleOpenProject(project)}
                    className="flex w-full items-center justify-between rounded-md border border-border p-3 text-left transition-colors hover:bg-muted"
                  >
                    <div>
                      <div className="font-medium">{project.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Updated: {new Date(project.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showNewProjectDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-emerald-700">
              Unsaved Changes
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You have unsaved changes. Are you sure you want to create a new
              project? Your current progress will be lost.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  toast.info("Canceled creating new project");
                  setShowNewProjectDialog(false);
                }}
                className="rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-secondary hover:text-neutral-50 "
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    setCurrentProject(null);
                    setProjectName("Untitled Project");
                    setLastSaved(null);
                    await updateFromDBML("");
                    toast.success("New project created successfully!");
                  } catch {
                    toast.error("Failed to create new project.");
                  } finally {
                    setShowNewProjectDialog(false);
                    setShowActionMenu(false);
                  }
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium hover:bg-secondary"
              >
                Create New
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
