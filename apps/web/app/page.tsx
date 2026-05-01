"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AIChat } from "@/components/custom/ai-chat";
import {
  AITechStackDialog,
  getSavedTechStack,
  type TechStack,
} from "@/components/custom/ai-tech-stack-dialog";
import { APISettingsDialog } from "@/components/custom/api-settings-dialog";
import DBMLEditor from "@/components/custom/dbml-editor";
import { Sidebar } from "@/components/custom/sidebar";
import { ProjectDialogs } from "@/components/custom/toolbar/project-dialogs";
import { TopToolbar } from "@/components/custom/top-toolbar";
import XYFlows from "@/components/custom/xyflows";
import { Button } from "@/components/ui/button";
import { useProjectManager } from "@/hooks/use-project-manager";
import { db } from "@/lib/db";
import { useSchemaStore } from "@/store/use-schema-store";

export default function Home() {
  const flowContainerRef = useRef<HTMLDivElement>(null);
  const {
    dbml,
    nodes,
    edges,
    updateFromDBML,
    setNodes,
    setEdges,
    showIde,
    toggleIde,
  } = useSchemaStore();

  const {
    currentProject,
    setCurrentProject,
    projectName,
    projects,
    loadProjects,
    handleNew,
    handleOpenProject,
    handleSave,
  } = useProjectManager({
    dbml,
    nodes,
    edges,
    updateFromDBML,
    setNodes,
    setEdges,
  });

  const [showProjectBrowser, setShowProjectBrowser] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [showTechStackDialog, setShowTechStackDialog] = useState(false);
  const [showAISettings, setShowAISettings] = useState(false);
  const [currentTechStack, setCurrentTechStack] = useState<
    TechStack | undefined
  >();

  const handleNewWithConfirmation = async () => {
    if (dbml && dbml.trim().length > 0) {
      setShowNewProjectDialog(true);
      return;
    }

    // Close AI chat and clear tech stack for new project
    setShowAIChat(false);
    setCurrentTechStack(undefined);

    await handleNew();
  };

  // Handle browse
  const handleBrowse = async () => {
    setShowAIChat(false);
    await loadProjects();
    setShowProjectBrowser(true);
  };

  // Confirm new project
  const confirmNewProject = async () => {
    try {
      // Close AI chat and clear tech stack for new project
      setShowAIChat(false);
      setCurrentTechStack(undefined);

      await handleNew();
    } catch {
      toast.error("Failed to create new project.");
    } finally {
      setShowNewProjectDialog(false);
    }
  };

  // Handle open project with dialog close
  const handleOpenProjectWithClose = async (project: any) => {
    setShowAIChat(false);
    setCurrentTechStack(undefined);

    await handleOpenProject(project);
    setShowProjectBrowser(false);
  };

  // Handle AI button click - toggle AI chat
  const handleAIClick = async () => {
    if (showAIChat) {
      setShowAIChat(false);
      return;
    }

    let projectId: string | undefined = currentProject?.id;

    if (!projectId) {
      // Check if there's DBML content to save first
      if (dbml && dbml.trim().length > 0) {
        projectId = await handleSave();
        const savedTechStack = await getSavedTechStack();
        // console.log("savedTechStack", savedTechStack);
        if (savedTechStack) {
          setCurrentTechStack(savedTechStack);
          setShowAIChat(true);
          if (showIde) {
            toggleIde();
          }
          return;
        }
      }
      setShowTechStackDialog(true);
      return;
    }

    const savedTechStack = await getSavedTechStack();

    // Always update state with fresh data from DB
    setCurrentTechStack(savedTechStack || undefined);

    if (savedTechStack) {
      setShowAIChat(true);
      if (showIde) {
        toggleIde();
      }
    } else {
      setShowTechStackDialog(true);
    }
  };

  // Handle tech stack generation
  const handleTechStackGenerate = async (techStack: TechStack) => {
    setCurrentTechStack(techStack);

    // Ensure project exists and save tech stack
    let projectId = currentProject?.id;

    // Check if project actually exists in DB
    if (projectId) {
      const projectExists = await db.projects.get(projectId);
      if (!projectExists) {
        setCurrentProject(null); // Clear the invalid project from state
        projectId = undefined; // Force creation of new project
      }
    }

    if (!projectId) {
      projectId = await handleSave();
    }

    if (projectId) {
      // Save tech stack to the project
      try {
        const updateResult = await db.projects.update(projectId, {
          techStack: {
            database: techStack.database,
            orm: techStack.orm,
            language: techStack.language,
            backendFramework: techStack.backendFramework,
            authLibrary: techStack.authLibrary,
            billingLibrary: techStack.billingLibrary,
          },
          updatedAt: new Date(),
        });

        const verify = await db.projects.get(projectId);

        if (!verify?.techStack) {
          throw new Error("Tech stack was not saved!");
        }

        toast.success("Tech stack saved!");
      } catch (error) {
        // console.error("Failed to save tech stack:", error);
        toast.error("Failed to save tech stack");
      }
    }

    setShowAIChat(true);
    // Always close IDE when opening AI chat
    if (showIde) {
      toggleIde();
    }
  };

  // Handle toggle editor - close AI chat if opening editor
  const handleToggleEditor = () => {
    if (!showIde && showAIChat) {
      setShowAIChat(false);
    }
    toggleIde();
  };

  // Handle schema generated from AI
  const handleSchemaGenerated = async (dbmlContent: string) => {
    try {
      await updateFromDBML(dbmlContent);
      toast.success("Schema updated successfully!");
    } catch (error) {
      // console.error("Failed to update schema:", error);
      toast.error("Failed to update schema");
    }
  };

  return (
    <div className="flex h-screen w-full flex-col">
      <TopToolbar
        confirmNewProject={confirmNewProject}
        flowContainerRef={flowContainerRef}
        handleNewWithConfirmation={handleNewWithConfirmation}
        onBrowse={handleBrowse}
        onConfirmNew={confirmNewProject}
        onNewProjectDialogChange={setShowNewProjectDialog}
        showNewProjectDialog={showNewProjectDialog}
      />
      <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden">
        <aside className="shrink-0 border-border border-r bg-background">
          <Sidebar
            isAIOpen={showAIChat}
            isEditorOpen={showIde}
            onAI={handleAIClick}
            onBrowse={handleBrowse}
            onNew={handleNewWithConfirmation}
            onToggleEditor={handleToggleEditor}
          />
        </aside>

        <main className="relative flex flex-1 overflow-hidden">
          {/* Toggle button for IDE/AI Chat */}
          {!showAIChat && (
            <Button
              className={`absolute top-14 z-10 h-14 w-2 bg-card px-4 py-2 backdrop-blur-sm transition-all hover:bg-accent ${
                showIde ? "left-[576px]" : "left-0"
              }`}
              onClick={handleToggleEditor}
              title={showIde ? "Close IDE" : "Open IDE"}
            >
              {showIde ? (
                <ChevronLeft className="h-5 w-5 text-primary" />
              ) : (
                <ChevronRight className="h-5 w-5 text-primary" />
              )}
            </Button>
          )}

          {/* AI Chat toggle button */}
          {showAIChat && (
            <Button
              className="absolute top-13 left-[576px] z-10 h-12 w-4 rounded-lg border border-border/60 bg-card/75 px-4 py-2 shadow-lg backdrop-blur-sm transition-all hover:bg-accent"
              onClick={() => setShowAIChat(false)}
              title="Close AI Chat"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}

          {/* Show either IDE or AI Chat, not both */}
          {showIde && !showAIChat && (
            <div className="relative z-10 min-w-xl max-w-xl shrink-0 border-border border-r bg-background">
              <DBMLEditor />
            </div>
          )}

          {showAIChat && currentProject?.id && (
            <div className="relative z-10 min-w-xl max-w-xl shrink-0 border-border border-r bg-background">
              <AIChat
                isOpen={showAIChat}
                key={`ai-chat-${currentProject.id}`}
                onClose={() => setShowAIChat(false)}
                onOpenSettings={() => setShowAISettings(true)}
                onOpenTechStack={() => setShowTechStackDialog(true)}
                onSchemaGenerated={handleSchemaGenerated}
                projectId={currentProject.id as string}
              />
            </div>
          )}

          <div className="h-full flex-1" ref={flowContainerRef}>
            <XYFlows />
          </div>
        </main>

        <ProjectDialogs
          onConfirmDelete={async () => {}}
          onConfirmNew={confirmNewProject}
          onDeleteDialogChange={() => {}}
          onNewProjectDialogChange={setShowNewProjectDialog}
          onOpenProject={handleOpenProjectWithClose}
          onProjectBrowserChange={setShowProjectBrowser}
          projectName={projectName}
          projects={projects}
          showDeleteDialog={false}
          showNewProjectDialog={showNewProjectDialog}
          showProjectBrowser={showProjectBrowser}
        />

        {/* AI Dialogs */}
        <AITechStackDialog
          isOpen={showTechStackDialog}
          onClose={() => setShowTechStackDialog(false)}
          onGenerate={handleTechStackGenerate}
          projectId={currentProject?.id}
        />

        <APISettingsDialog
          onOpenChange={setShowAISettings}
          open={showAISettings}
        />
      </div>
    </div>
  );
}
