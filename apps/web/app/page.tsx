"use client";
import { useRef, useState } from "react";
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

  return (
    <div className="flex h-screen w-full flex-col">
      <TopToolbar flowContainerRef={flowContainerRef} />
      <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden">
        <aside className="shrink-0 border-r border-border bg-background">
          <Sidebar
            onNew={handleNewWithConfirmation}
            onBrowse={handleBrowse}
          />
        </aside>

        <main className="flex flex-1 overflow-hidden relative">
          <Button
            onClick={toggleIde}
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

          {showIde && (
            <div className="min-w-xl shrink-0 border-r border-border bg-background">
              <DBMLEditor />
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
