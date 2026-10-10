"use client";

import { IconBrandGithub } from "@tabler/icons-react";
import { Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { useImageExport } from "@/hooks/use-image-export";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import type { useProjectManager } from "@/hooks/use-project-manager";
import { createCommands, SHORTCUT_CONFIGS } from "@/lib/shortcuts-config";
import { useSchemaStore } from "@/store/use-schema-store";
import { Button } from "../ui/button";
import { APISettingsDialog } from "./api-settings-dialog";
import { CommandPalette } from "./command-palette";
import { FormatButton } from "./format-button";
import { HelpDialog } from "./help-dialog";
import { HistoryDialog } from "./history-dialog";
import { ImportSchemaDialog } from "./import-db/import-schema-dialog";
import { Logo } from "./logo";
import { ActionMenu } from "./toolbar/action-menu";
import { Export } from "./toolbar/export/export";
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
  projectManager: ReturnType<typeof useProjectManager>;
  showNewProjectDialog: boolean;
}

export function TopToolbar({
  projectManager,
  flowContainerRef,
  handleNewWithConfirmation,
  confirmNewProject,
  showNewProjectDialog,
  onNewProjectDialogChange,
  onConfirmNew,
  onBrowse,
}: TopToolbarProps) {
  const { dbml, nodes, edges, updateFromDBML } = useSchemaStore();
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
  } = projectManager;

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
  const [showHistory, setShowHistory] = useState(false);
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
    enabled: !isEditingName,
    shortcuts: shortcuts.map((s) => ({
      ...s,
      action: () => {
        if (showCommandPalette || showHelpDialog || showProjectBrowser) {
          return;
        }
        s.action();
      },
    })),
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
        window.open("https://github.com/santosh-marar/enops-atlas", "_blank");
      }
    },
  }));

  const content = JSON.stringify({ dbml, edges, nodes, projectName });

  // resets auto-save timer
  const handleSaveWithReset = useCallback(async () => {
    const savedId = await handleSave();
    if (!savedId) return;
    lastSavedContentRef.current = content;
    // Clear the timer when manual save happens
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, [handleSave, content]);

  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Only auto-save if there's a current project, content exists, and content has changed
    if (currentProject && content !== lastSavedContentRef.current) {
      autoSaveTimerRef.current = setTimeout(() => {
        handleSave().then((savedId) => {
          if (savedId) lastSavedContentRef.current = content;
        });
      }, 30_000); // 30 seconds
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [content, currentProject, handleSave]);

  // Update lastSavedContentRef when project loads
  useEffect(() => {
    if (currentProject) {
      lastSavedContentRef.current = content;
    }
  }, [currentProject?.id]);

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

      <HistoryDialog
        dbml={dbml}
        onOpenChange={setShowHistory}
        onRestore={(text) => updateFromDBML(text)}
        open={showHistory}
        projectId={currentProject?.id ?? null}
      />

      <div className="flex items-center justify-between bg-background px-4 py-2 shadow-sm">
        {/* Left Section */}
        <div className="flex items-center gap-4">
          <Logo />

          <div className="flex items-center gap-2">
            <ActionMenu
              hasCurrentProject={!!currentProject}
              onBrowse={onBrowse}
              onDelete={handleDeleteWithDialog}
              // onExport={handleExportImage}
              onImportDb={() => setShowImportDbDialog(true)}
              onNew={handleNewWithConfirmation}
            />

            <Button
              onClick={() => setShowHelpDialog(true)}
              size={"sm"}
              variant={"ghost"}
            >
              Help
            </Button>

            <APISettingsDialog>
              <Button size={"sm"} variant="ghost">
                AI Settings
              </Button>
            </APISettingsDialog>

            <Export />

            <FormatButton />

            <Button
              onClick={() => setShowHistory(true)}
              size="sm"
              variant="ghost"
            >
              History
            </Button>
          </div>
        </div>

        {/* Middle Section - Project Name */}
        {currentProject !== null && (
          <ProjectNameEditor
            key={currentProject.id}
            onEditingChange={setIsEditingName}
            onNameChange={setProjectName}
            onNameCommit={handleSaveWithReset}
            projectName={projectName}
          />
        )}

        {/* Right Section */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            Saved: {formatLastSaved()}
          </span>
          <Button disabled={isSaving} onClick={handleSaveWithReset} size="sm">
            {isSaving ? <>Saving...</> : <>Save</>}
          </Button>
          <Button
            onClick={toggleTheme}
            size={"sm"}
            title={`Toggle theme (Ctrl + Shift + ${SHORTCUT_CONFIGS.TOGGLE_THEME.key.toUpperCase()})`}
            variant={"ghost"}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button size="sm" variant={"link"}>
            <Link
              href="https://github.com/santosh-marar/enops-atlas"
              rel="noopener noreferrer"
              target="_blank"
            >
              <IconBrandGithub className="h-4 w-4" />
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
        showNewProjectDialog={false}
        showProjectBrowser={showProjectBrowser}
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
