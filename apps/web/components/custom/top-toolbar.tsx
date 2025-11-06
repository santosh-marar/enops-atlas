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
  Loader2,
  X,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  Maximize,
  Lock,
  Unlock,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { Button } from "../ui/button";
import { CommandPalette } from "./command-palette";
import { HelpDialog } from "./help-dialog";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Lazy load heavy dependencies
const loadDB = () => import("@/lib/db").then((mod) => ({ db: mod.db }));
const loadImageExport = () => import("html-to-image");

// localStorage key for tracking last opened project
const LAST_PROJECT_KEY = "enops-dev-last-project-id";

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
  const { dbml, nodes, edges, updateFromDBML, setNodes, setEdges } =
    useSchemaStore();
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState("Untitled Project");
  const [isEditingName, setIsEditingName] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showProjectBrowser, setShowProjectBrowser] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const exportCancelRef = useRef(false);

  // Define all keyboard shortcuts and commands
  const shortcuts = [
    {
      key: "k",
      ctrl: true,
      description: "Open command palette",
      category: "General",
      action: () => setShowCommandPalette(true),
    },
    {
      key: "/",
      ctrl: true,
      description: "Show keyboard shortcuts",
      category: "General",
      action: () => setShowHelpDialog(true),
    },
    {
      key: "s",
      ctrl: true,
      description: "Save project",
      category: "Project",
      action: () => handleSave(),
    },
    {
      key: "n",
      ctrl: true,
      shift: true,
      description: "New project",
      category: "Project",
      action: () => handleNew(),
    },
    {
      key: "o",
      ctrl: true,
      description: "Browse projects",
      category: "Project",
      action: () => handleBrowse(),
    },
    {
      key: "e",
      ctrl: true,
      shift: true,
      description: "Export as PNG",
      category: "Export",
      action: () => handleExportImage("png"),
    },
  ];

  // Setup keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: shortcuts.map((s) => ({
      ...s,
      action: () => {
        // Don't trigger shortcuts when modals are open (except for closing them)
        if (showCommandPalette || showHelpDialog || showProjectBrowser) return;
        s.action();
      },
    })),
    enabled: !isEditingName, // Disable when editing project name
  });

  // Commands for command palette
  const commands = [
    {
      id: "new-project",
      label: "New Project",
      description: "Create a new project",
      icon: Plus,
      category: "Project",
      shortcut: shortcuts.find((s) => s.key === "n" && s.ctrl && s.shift),
      action: () => handleNew(),
    },
    {
      id: "save-project",
      label: "Save Project",
      description: "Save current project",
      icon: Save,
      category: "Project",
      shortcut: shortcuts.find((s) => s.key === "s" && s.ctrl),
      action: () => handleSave(),
    },
    {
      id: "browse-projects",
      label: "Browse Projects",
      description: "Open project browser",
      icon: FolderOpen,
      category: "Project",
      shortcut: shortcuts.find((s) => s.key === "o" && s.ctrl),
      action: () => handleBrowse(),
    },
    {
      id: "delete-project",
      label: "Delete Project",
      description: "Delete current project",
      icon: Trash2,
      category: "Project",
      action: () => handleDelete(),
    },
    {
      id: "export-png",
      label: "Export as PNG",
      description: "Export diagram as PNG image",
      icon: ImageIcon,
      category: "Export",
      shortcut: shortcuts.find((s) => s.key === "e" && s.ctrl && s.shift),
      action: () => handleExportImage("png"),
    },
    {
      id: "export-jpeg",
      label: "Export as JPEG",
      description: "Export diagram as JPEG image",
      icon: ImageIcon,
      category: "Export",
      action: () => handleExportImage("jpeg"),
    },
    {
      id: "export-svg",
      label: "Export as SVG",
      description: "Export diagram as SVG vector",
      icon: ImageIcon,
      category: "Export",
      action: () => handleExportImage("svg"),
    },
    {
      id: "help",
      label: "Keyboard Shortcuts",
      description: "View all keyboard shortcuts",
      icon: HelpCircle,
      category: "Help",
      shortcut: shortcuts.find((s) => s.key === "/" && s.ctrl),
      action: () => setShowHelpDialog(true),
    },
    {
      id: "github",
      label: "Open GitHub",
      description: "Visit the GitHub repository",
      icon: Github,
      category: "Help",
      action: () => window.open("https://github.com/santosh-marar/enops.dev", "_blank"),
    },
  ];

  // Load projects (lazy)
  const loadProjects = useCallback(async () => {
    try {
      const { db } = await loadDB();
      const allProjects = await db.projects
        .orderBy("updatedAt")
        .reverse()
        .toArray();
      setProjects(allProjects);
    } catch (error) {
      console.error("Failed to load projects:", error);
    }
  }, []);

  // Auto-save with debouncing - only when dbml changes
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Only auto-save if there's a current project and dbml content
    if (currentProject && dbml && dbml.trim().length > 0) {
      autoSaveTimerRef.current = setTimeout(() => {
        handleSave();
      }, 5000); // Auto-save every 5s
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

  const handleSave = useCallback(async () => {
    if (isSaving) return; // Prevent double saves

    setIsSaving(true);
    try {
      const { db } = await loadDB();

      if (currentProject?.id) {
        await db.projects.update(currentProject.id, {
          name: projectName,
          dbml,
          nodes,
          edges,
          updatedAt: new Date(),
        });
      } else {
        const id = await db.projects.add({
          name: projectName,
          dbml,
          nodes,
          edges,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        setCurrentProject({
          id,
          name: projectName,
          dbml,
          nodes,
          edges,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      setLastSaved(new Date());
    } catch (error) {
      toast.error("Failed to save project. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [currentProject, projectName, dbml, nodes, edges, isSaving]);

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

  const handleDelete = () => {
    if (currentProject?.id) {
      setShowDeleteDialog(true);
    }
    setShowActionMenu(false);
  };

  const confirmDelete = async () => {
    if (!currentProject?.id) return;

    try {
      const { db } = await loadDB();
      await db.projects.delete(currentProject.id);
      setCurrentProject(null);
      setProjectName("Untitled Project");
      setLastSaved(null);
      await updateFromDBML("");
      toast.success("Project deleted successfully!");
    } catch (error) {
      console.error("Failed to delete project:", error);
      toast.error("Failed to delete project. Please try again.");
    } finally {
      setShowDeleteDialog(false);
    }
  };

  const handleBrowse = async () => {
    await loadProjects();
    setShowProjectBrowser(true);
    setShowActionMenu(false);
  };

  const handleOpenProject = useCallback(
    async (project: Project) => {
      try {
        setCurrentProject(project);
        setProjectName(project.name);
        setLastSaved(project.updatedAt);

        // Store the project ID in localStorage for auto-restore on refresh
        if (project.id) {
          localStorage.setItem(LAST_PROJECT_KEY, project.id.toString());
        }

        // If project has saved nodes, restore them first
        if (project.nodes && project.nodes.length > 0) {
          setNodes(project.nodes);
        }
        if (project.edges && project.edges.length > 0) {
          setEdges(project.edges);
        }

        // Update the store which will preserve positions if nodes exist
        await updateFromDBML(
          project.dbml || "",
          project.nodes && project.nodes.length > 0
        );

        setShowProjectBrowser(false);
      } catch (error) {
        toast.error("Failed to open project. Please try again.");
      }
    },
    [setNodes, setEdges, updateFromDBML]
  );

  // Auto-restore last opened project on mount
  useEffect(() => {
    const restoreLastProject = async () => {
      try {
        const lastProjectId = localStorage.getItem(LAST_PROJECT_KEY);
        if (!lastProjectId) return;

        const { db } = await loadDB();
        const project = await db.projects.get(parseInt(lastProjectId));

        if (project) {
          await handleOpenProject(project);
        } else {
          // Project was deleted, clear localStorage
          localStorage.removeItem(LAST_PROJECT_KEY);
        }
      } catch (error) {
        console.error("Failed to restore last project:", error);
        localStorage.removeItem(LAST_PROJECT_KEY);
      }
    };

    restoreLastProject();
  }, [handleOpenProject]); // Run once on mount

  const handleExportImage = async (format: "png" | "jpeg" | "svg") => {
    if (!flowContainerRef?.current) {
      toast.error("Flow diagram not found");
      return;
    }

    if (isExporting) return;

    exportCancelRef.current = false;
    setIsExporting(true);
    setIsCancelling(false);
    setShowExportMenu(false);
    setShowActionMenu(false); // Close action menu when export starts

    // Use setTimeout with minimal delay to allow UI to update before blocking operation
    setTimeout(async () => {
      try {
        // Check if cancelled before starting
        if (exportCancelRef.current) {
          toast.info("Export cancelled");
          setIsExporting(false);
          setIsCancelling(false);
          return;
        }

        const imageLib = await loadImageExport();

        // Check if cancelled after loading library
        if (exportCancelRef.current) {
          toast.info("Export cancelled");
          setIsExporting(false);
          setIsCancelling(false);
          return;
        }

        const { toPng, toJpeg, toSvg } = imageLib;
        const element = flowContainerRef.current;
        if (!element) {
          setIsExporting(false);
          setIsCancelling(false);
          return;
        }

        let dataUrl: string;

        if (format === "png") {
          dataUrl = await toPng(element, {
            quality: 0.95,
            pixelRatio: 1.5,
            cacheBust: false,
          });
        } else if (format === "jpeg") {
          dataUrl = await toJpeg(element, {
            quality: 0.9,
            pixelRatio: 1.5,
            cacheBust: false,
          });
        } else {
          dataUrl = await toSvg(element, { cacheBust: false });
        }

        // Check if cancelled before downloading
        if (exportCancelRef.current) {
          toast.info("Export cancelled");
          setIsExporting(false);
          setIsCancelling(false);
          return;
        }

        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${projectName.replace(/\s+/g, "_")}_diagram.${format}`;
        a.click();
        toast.success("Diagram exported successfully!");
      } catch (error) {
        if (!exportCancelRef.current) {
          toast.error("Failed to export image. Please try again.");
        }
      } finally {
        setIsExporting(false);
        setIsCancelling(false);
        exportCancelRef.current = false;
      }
    }, 50); // Small delay to ensure UI updates
  };

  const handleCancelExport = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (isCancelling) return;

    // Show cancelling state immediately
    setIsCancelling(true);
    exportCancelRef.current = true;
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
              {isCancelling ? null : (
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              )}
              <div className="text-center">
                <div className="font-semibold">Exporting Diagram...</div>
                <div className="text-sm text-muted-foreground">
                  This may take a few seconds
                </div>
              </div>
              <Button
                onClick={handleCancelExport}
                disabled={isCancelling}
                variant={"destructive"}
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4" />
                    Cancel
                  </>
                )}
              </Button>
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
                <button
                  onClick={handleDelete}
                  disabled={!currentProject}
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

          <button
            onClick={() => setShowHelpDialog(true)}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <HelpCircle className="h-4 w-4" />
            Help
          </button>
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
          <span className="text-xs text-muted-foreground">
            Saved: {formatLastSaved()}
          </span>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save
              </>
            )}
          </button>
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
      <Dialog open={showProjectBrowser} onOpenChange={setShowProjectBrowser}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Browse Projects</DialogTitle>
            <DialogDescription>
              Select a project to open
            </DialogDescription>
          </DialogHeader>

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
        </DialogContent>
      </Dialog>

      {/* New Project Confirmation Dialog */}
      <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-emerald-700">Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Are you sure you want to create a new
              project? Your current progress will be lost.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                toast.info("Canceled creating new project");
                setShowNewProjectDialog(false);
              }}
            >
              Cancel
            </Button>
            <Button
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
            >
              Create New
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Project Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{projectName}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
            >
              Delete Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={commands}
      />

      {/* Help Dialog */}
      <HelpDialog
        isOpen={showHelpDialog}
        onClose={() => setShowHelpDialog(false)}
        shortcuts={shortcuts}
      />
    </>
  );
}
