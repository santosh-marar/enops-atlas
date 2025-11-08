"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSchemaStore } from "@/store/use-schema-store";
import { useTheme } from "next-themes";
import {
  Save,
  Github,
  HelpCircle,
  Loader2,
  Moon,
  Sun,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { CommandPalette } from "./command-palette";
import { HelpDialog } from "./help-dialog";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useProjectManager } from "@/hooks/use-project-manager";
import { useImageExport } from "@/hooks/use-image-export";
import { SHORTCUT_CONFIGS, createCommands } from "@/lib/shortcuts-config";
import { ExportLoadingOverlay } from "./toolbar/export-loading-overlay";
import { ActionMenu } from "./toolbar/action-menu";
import { ProjectNameEditor } from "./toolbar/project-name-editor";
import { ProjectDialogs } from "./toolbar/project-dialogs";
import { APISettingsDialog } from "./api-settings-dialog";

interface TopToolbarProps {
  flowContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export function TopToolbar({ flowContainerRef }: TopToolbarProps) {
  const { dbml, nodes, edges, updateFromDBML, setNodes, setEdges, } =
    useSchemaStore();
  const { theme, setTheme } = useTheme();

  // Project management
  const {
    currentProject,
    projectName,
    setProjectName,
    lastSaved,
    projects,
    isSaving,
    loadProjects,
    handleSave,
    handleNew,
    handleDelete,
    handleOpenProject,
  } = useProjectManager({ dbml, nodes, edges, updateFromDBML, setNodes, setEdges });

  // Image export
  const { isExporting, isCancelling, handleExportImage, handleCancelExport } =
    useImageExport({ flowContainerRef, projectName });

  // UI state
  const [isEditingName, setIsEditingName] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showProjectBrowser, setShowProjectBrowser] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>("");

  // Toggle theme function
  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  // Handle new project with confirmation
  const handleNewWithConfirmation = async () => {
    if (dbml && dbml.trim().length > 0) {
      setShowNewProjectDialog(true);
      return;
    }
    await handleNew();
  };

  // Handle delete with dialog
  const handleDeleteWithDialog = () => {
    if (currentProject?.id) {
      setShowDeleteDialog(true);
    }
  };

  // Handle browse
  const handleBrowse = async () => {
    await loadProjects();
    setShowProjectBrowser(true);
  };

  // Confirm new project
  const confirmNewProject = async () => {
    try {
      await handleNew();
    } catch {
      toast.error("Failed to create new project.");
    } finally {
      setShowNewProjectDialog(false);
    }
  };

  // Confirm delete project
  const confirmDeleteProject = async () => {
    await handleDelete();
    setShowDeleteDialog(false);
  };

  // Handle open project with dialog close
  const handleOpenProjectWithClose = async (project: any) => {
    await handleOpenProject(project);
    setShowProjectBrowser(false);
  };

  // Define shortcuts
  const shortcuts = Object.values(SHORTCUT_CONFIGS).map((config) => ({
    ...config,
    action: () => {
      switch (config) {
        case SHORTCUT_CONFIGS.COMMAND_PALETTE:
          setShowCommandPalette(true);
          break;
        case SHORTCUT_CONFIGS.KEYBOARD_SHORTCUTS:
          setShowHelpDialog(true);
          break;
        case SHORTCUT_CONFIGS.TOGGLE_THEME:
          toggleTheme();
          break;
        case SHORTCUT_CONFIGS.SAVE_PROJECT:
          handleSaveWithReset();
          break;
        case SHORTCUT_CONFIGS.NEW_PROJECT:
          handleNewWithConfirmation();
          break;
        case SHORTCUT_CONFIGS.BROWSE_PROJECTS:
          handleBrowse();
          break;
        case SHORTCUT_CONFIGS.EXPORT_PNG:
          handleExportImage("png");
          break;
      }
    },
  }));

  // Setup keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: shortcuts.map((s) => ({
      ...s,
      action: () => {
        if (showCommandPalette || showHelpDialog || showProjectBrowser) return;
        s.action();
      },
    })),
    enabled: !isEditingName,
  });

  // Create commands for command palette
  const commands = createCommands(
    theme,
    setTheme,
    handleNewWithConfirmation,
    handleSave,
    handleBrowse,
    handleDeleteWithDialog,
    handleExportImage,
    setShowHelpDialog
  ).map((cmd) => ({
    ...cmd,
    action: () => {
      if (cmd.id === "toggle-theme") {
        toggleTheme();
      } else if (cmd.id === "new-project") {
        handleNewWithConfirmation();
      } else if (cmd.id === "save-project") {
        handleSaveWithReset();
      } else if (cmd.id === "browse-projects") {
        handleBrowse();
      } else if (cmd.id === "delete-project") {
        handleDeleteWithDialog();
      } else if (cmd.id === "export-png") {
        handleExportImage("png");
      } else if (cmd.id === "export-jpeg") {
        handleExportImage("jpeg");
      } else if (cmd.id === "export-svg") {
        handleExportImage("svg");
      } else if (cmd.id === "help") {
        setShowHelpDialog(true);
      } else if (cmd.id === "github") {
        window.open("https://github.com/santosh-marar/enops.dev", "_blank");
      }
    },
  }));

  // resets auto-save timer
  const handleSaveWithReset = useCallback(async () => {
    await handleSave();
    lastSavedContentRef.current = dbml;
    // Clear the timer when manual save happens
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, [handleSave, dbml]);

  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Only auto-save if there's a current project, content exists, and content has changed
    if (
      currentProject &&
      dbml &&
      dbml.trim().length > 0 &&
      dbml !== lastSavedContentRef.current
    ) {
      autoSaveTimerRef.current = setTimeout(() => {
        handleSave();
        lastSavedContentRef.current = dbml;
      }, 30000); // 30 seconds
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbml, currentProject]);

  // Update lastSavedContentRef when project loads
  useEffect(() => {
    if (currentProject) {
      lastSavedContentRef.current = dbml;
    }
  }, [currentProject, dbml]);

  // Format last saved time
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
      <ExportLoadingOverlay
        isExporting={isExporting}
        isCancelling={isCancelling}
        onCancel={handleCancelExport}
      />

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
            />
            <span className="text-sm font-bold">Enops.dev</span>
          </div>

          <ActionMenu
            onNew={handleNewWithConfirmation}
            onBrowse={handleBrowse}
            onDelete={handleDeleteWithDialog}
            onExport={handleExportImage}
            hasCurrentProject={!!currentProject}
          />

          <button
            onClick={() => setShowHelpDialog(true)}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <HelpCircle className="h-4 w-4" />
            Help
          </button>

          <APISettingsDialog>
            <button className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted">
              <Settings className="h-4 w-4" />
              AI Settings
            </button>
          </APISettingsDialog>

        </div>

        {/* Middle Section - Project Name */}
        <ProjectNameEditor
          projectName={projectName}
          onNameChange={setProjectName}
          onEditingChange={setIsEditingName}
        />

        {/* Right Section */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground">
            Saved: {formatLastSaved()}
          </span>
          <button
            onClick={handleSaveWithReset}
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
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
            title={`Toggle theme (${SHORTCUT_CONFIGS.TOGGLE_THEME.key.toUpperCase()} + Ctrl + Shift)`}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
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

      <ProjectDialogs
        showProjectBrowser={showProjectBrowser}
        onProjectBrowserChange={setShowProjectBrowser}
        projects={projects}
        onOpenProject={handleOpenProjectWithClose}
        showNewProjectDialog={showNewProjectDialog}
        onNewProjectDialogChange={setShowNewProjectDialog}
        onConfirmNew={confirmNewProject}
        showDeleteDialog={showDeleteDialog}
        onDeleteDialogChange={setShowDeleteDialog}
        onConfirmDelete={confirmDeleteProject}
        projectName={projectName}
      />

      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={commands}
      />

      <HelpDialog
        isOpen={showHelpDialog}
        onClose={() => setShowHelpDialog(false)}
        shortcuts={shortcuts}
      />
    </>
  );
}
