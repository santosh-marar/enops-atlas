"use client";

import {
  Crown,
  Github,
  HelpCircle,
  Loader2,
  Moon,
  Save,
  Settings,
  Sun,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { useImageExport } from "@/hooks/use-image-export";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useProjectManager } from "@/hooks/use-project-manager";
import { createCommands, SHORTCUT_CONFIGS } from "@/lib/shortcuts-config";
import { useSchemaStore } from "@/store/use-schema-store";
import { Button } from "../ui/button";
import { AIExportDialog } from "./ai-export-dialog";
import { APISettingsDialog } from "./api-settings-dialog";
import { CommandPalette } from "./command-palette";
import { HelpDialog } from "./help-dialog";
import { ImportSchemaDialog } from "./import-db/import-schema-dialog";
import { ActionMenu } from "./toolbar/action-menu";
import { ExportLoadingOverlay } from "./toolbar/export-loading-overlay";
import { ProjectDialogs } from "./toolbar/project-dialogs";
import { ProjectNameEditor } from "./toolbar/project-name-editor";

interface TopToolbarProps {
  confirmNewProject: () => void;
  flowContainerRef?: React.RefObject<HTMLDivElement | null>;
  handleNewWithConfirmation: () => void;
  onBrowse: () => void;
  onConfirmNew: () => void;
  onNewProjectDialogChange: (show: boolean) => void;
  showNewProjectDialog: boolean;
}

export function TopToolbar({
  flowContainerRef,
  handleNewWithConfirmation,
  confirmNewProject,
  showNewProjectDialog,
  onNewProjectDialogChange,
  onConfirmNew,
  onBrowse,
}: TopToolbarProps) {
  const { dbml, nodes, edges, updateFromDBML, setNodes, setEdges } =
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
  } = useProjectManager({
    dbml,
    nodes,
    edges,
    updateFromDBML,
    setNodes,
    setEdges,
  });

  // Image export
  const { isExporting, isCancelling, handleExportImage, handleCancelExport } =
    useImageExport({ flowContainerRef, projectName });

  // UI state
  const [isEditingName, setIsEditingName] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showProjectBrowser, setShowProjectBrowser] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showImportDbDialog, setShowImportDbDialog] = useState(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>("");

  // Toggle theme function
  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  // Handle delete with dialog
  const handleDeleteWithDialog = () => {
    if (currentProject?.id) {
      setShowDeleteDialog(true);
    }
  };

  // Confirm delete project
  const confirmDeleteProject = async () => {
    await handleDelete();
    setShowDeleteDialog(false);
  };

  // Confirm new project and show import dialog
  const confirmNewProjectWithImport = () => {
    onConfirmNew();
    setShowImportDbDialog(true);
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
          onBrowse();
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
        if (showCommandPalette || showHelpDialog || showProjectBrowser) {
          return;
        }
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
    onBrowse,
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
        onBrowse();
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
      }, 30_000); // 30 seconds
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
    if (!lastSaved) {
      return "Never";
    }
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastSaved.getTime()) / 1000);

    if (diff < 60) {
      return "Just now";
    }
    if (diff < 3600) {
      return `${Math.floor(diff / 60)}m ago`;
    }
    if (diff < 86_400) {
      return `${Math.floor(diff / 3600)}h ago`;
    }
    return lastSaved.toLocaleDateString();
  };

  return (
    <>
      <ExportLoadingOverlay
        isCancelling={isCancelling}
        isExporting={isExporting}
        onCancel={handleCancelExport}
      />

      <div className="flex h-12 items-center justify-between bg-background px-4 shadow-sm">
        {/* Left Section */}
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <Image
              alt="Enops.dev Logo"
              className="rounded-full"
              height={48}
              src="/logo.png"
              width={48}
            />
            <span className="font-bold text-sm">Enops</span>
          </div>

          <ActionMenu
            hasCurrentProject={!!currentProject}
            onBrowse={onBrowse}
            onDelete={handleDeleteWithDialog}
            onExport={handleExportImage}
            onImportDb={() => setShowImportDbDialog(true)}
          />

          <Button
            onClick={() => setShowHelpDialog(true)}
            size={"sm"}
            variant={"ghost"}
          >
            <HelpCircle className="h-4 w-4" />
            Help
          </Button>

          <APISettingsDialog>
            <Button size={"sm"} variant="ghost">
              <Settings className="h-4 w-4" />
              AI Settings
            </Button>
          </APISettingsDialog>

          <AIExportDialog edges={edges} nodes={nodes} />

          <Button size={"sm"} variant="outline">
            <Link
              className="flex items-center justify-center gap-1"
              href={"https://cloud.enops.dev/pricing"}
            >
              <Crown className="size-4" /> Try Pro
            </Link>
          </Button>
        </div>

        {/* Middle Section - Project Name */}
        <ProjectNameEditor
          onEditingChange={setIsEditingName}
          onNameChange={setProjectName}
          projectName={projectName}
        />

        {/* Right Section */}
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground text-xs">
            Saved: {formatLastSaved()}
          </span>
          <Button disabled={isSaving} onClick={handleSaveWithReset} size={"sm"}>
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
          </Button>
          <Button
            onClick={toggleTheme}
            size={"icon-sm"}
            title={`Toggle theme (Ctrl + Shift + ${SHORTCUT_CONFIGS.TOGGLE_THEME.key.toUpperCase()})`}
            variant={"ghost"}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button asChild size={"icon-sm"} variant={"link"}>
            <Link
              href="https://github.com/santosh-marar/enops.dev"
              rel="noopener noreferrer"
              target="_blank"
            >
              <Github className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <ProjectDialogs
        onConfirmDelete={confirmDeleteProject}
        onConfirmNew={confirmNewProject}
        onDeleteDialogChange={setShowDeleteDialog}
        onNewProjectDialogChange={onNewProjectDialogChange}
        onOpenProject={handleOpenProjectWithClose}
        onProjectBrowserChange={setShowProjectBrowser}
        projectName={projectName}
        projects={projects}
        showDeleteDialog={showDeleteDialog}
        showNewProjectDialog={showNewProjectDialog}
      />

      <ImportSchemaDialog
        onOpenChange={setShowImportDbDialog}
        open={showImportDbDialog}
      />

      <CommandPalette
        commands={commands}
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
      />

      <HelpDialog
        isOpen={showHelpDialog}
        onClose={() => setShowHelpDialog(false)}
        shortcuts={shortcuts}
      />
    </>
  );
}
