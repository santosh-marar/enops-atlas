"use client";
import { useRef, useState, useEffect } from "react";
import { db } from "@/lib/db";
import DBMLEditor from "@/components/custom/dbml-editor";
import XYFlows from "@/components/custom/xyflows";
import { TopToolbar } from "@/components/custom/top-toolbar";
import { Sidebar } from "@/components/custom/sidebar";
import { useSchemaStore } from "@/store/use-schema-store";
import { useProjectManager } from "@/hooks/use-project-manager";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ProjectDialogs } from "@/components/custom/toolbar/project-dialogs";
import { AIChat } from "@/components/custom/ai-chat";
import { TechStack, getSavedTechStack } from "@/components/custom/ai-tech-stack-dialog";

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
  projectName,
  projects,
  loadProjects,
  handleNew,
  handleOpenProject,
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
const [currentTechStack, setCurrentTechStack] = useState<TechStack | undefined>();

// Handle new project with confirmation
const handleNewWithConfirmation = async () => {
  if (dbml && dbml.trim().length > 0) {
    setShowNewProjectDialog(true);
    return;
  }
  await handleNew();
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

// Handle open project with dialog close
const handleOpenProjectWithClose = async (project: any) => {
  await handleOpenProject(project);
  setShowProjectBrowser(false);
};

// Handle AI button click - toggle AI chat
const handleAIClick = async () => {
  // If AI chat is already open, close it
  if (showAIChat) {
    setShowAIChat(false);
    return;
  }

  // Otherwise, open it
  const savedTechStack = await getSavedTechStack();
  if (savedTechStack) {
    setCurrentTechStack(savedTechStack);
    setShowAIChat(true);
    // Always close IDE when opening AI chat
    if (showIde) {
      toggleIde();
    }
  } else {
    setShowTechStackDialog(true);
  }
};

// Handle tech stack generation
const handleTechStackGenerate = (techStack: TechStack) => {
  setCurrentTechStack(techStack);
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
    console.error("Failed to update schema:", error);
    toast.error("Failed to update schema");
  }
};

  return (
    <div className="flex h-screen w-full flex-col">
      <TopToolbar flowContainerRef={flowContainerRef} />
      <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden">
        <aside className="shrink-0 border-r border-border bg-background">
          <Sidebar
            onNew={handleNewWithConfirmation}
            onBrowse={handleBrowse}
            onAI={handleAIClick}
            onToggleEditor={handleToggleEditor}
            isEditorOpen={showIde}
          />
        </aside>

        <main className="flex flex-1 overflow-hidden relative">
          {/* Toggle button for IDE/AI Chat */}
          {!showAIChat && (
            <Button
              onClick={handleToggleEditor}
              title={showIde ? "Close IDE" : "Open IDE"}
              className={`absolute h-12 w-4 top-13 z-100 transition-all rounded-lg border border-border/60 bg-card/75 px-4 py-2 shadow-lg backdrop-blur-sm hover:bg-accent ${
                showIde ? "left-[576px]" : "left-0"
              }`}
            >
              {showIde ? (
                <ChevronLeft className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
            </Button>
          )}

          {/* AI Chat toggle button */}
          {showAIChat && (
            <Button
              onClick={() => setShowAIChat(false)}
              title="Close AI Chat"
              className="absolute h-12 w-4 top-13 left-[576px] z-100 transition-all rounded-lg border border-border/60 bg-card/75 px-4 py-2 shadow-lg backdrop-blur-sm hover:bg-accent"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}

          {/* Show either IDE or AI Chat, not both */}
          {showIde && !showAIChat && (
            <div className="min-w-xl max-w-xl shrink-0 border-r border-border bg-background relative z-10">
              <DBMLEditor />
            </div>
          )}

          {showAIChat && (
            <div className="min-w-xl max-w-xl shrink-0 border-r border-border bg-background relative z-10">
              <AIChat
                isOpen={true}
                onClose={() => setShowAIChat(false)}
                onSchemaGenerated={handleSchemaGenerated}
                onOpenSettings={() => setShowAISettings(true)}
                onOpenTechStack={() => setShowTechStackDialog(true)}
                initialTechStack={currentTechStack}
                projectId={currentProject?.id}
              />
            </div>
          )}

          <div className="flex-1 h-full" ref={flowContainerRef}>
            <XYFlows />
          </div>
        </main>

        <ProjectDialogs
          showProjectBrowser={showProjectBrowser}
          onProjectBrowserChange={setShowProjectBrowser}
          projects={projects}
          onOpenProject={handleOpenProjectWithClose}
          showNewProjectDialog={showNewProjectDialog}
          onNewProjectDialogChange={setShowNewProjectDialog}
          onConfirmNew={confirmNewProject}
          showDeleteDialog={false}
          onDeleteDialogChange={() => {}}
          onConfirmDelete={async () => {}}
          projectName={projectName}
        />
      </div>
    </div>
  );
}
