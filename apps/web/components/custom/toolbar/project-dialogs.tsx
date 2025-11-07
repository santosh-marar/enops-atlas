import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Project {
  id?: number;
  name: string;
  dbml: string;
  nodes?: any[];
  edges?: any[];
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectDialogsProps {
  // Browser dialog
  showProjectBrowser: boolean;
  onProjectBrowserChange: (show: boolean) => void;
  projects: Project[];
  onOpenProject: (project: Project) => void;

  // New project dialog
  showNewProjectDialog: boolean;
  onNewProjectDialogChange: (show: boolean) => void;
  onConfirmNew: () => void;

  // Delete dialog
  showDeleteDialog: boolean;
  onDeleteDialogChange: (show: boolean) => void;
  onConfirmDelete: () => void;
  projectName: string;
}

export function ProjectDialogs({
  showProjectBrowser,
  onProjectBrowserChange,
  projects,
  onOpenProject,
  showNewProjectDialog,
  onNewProjectDialogChange,
  onConfirmNew,
  showDeleteDialog,
  onDeleteDialogChange,
  onConfirmDelete,
  projectName,
}: ProjectDialogsProps) {
  return (
    <>
      {/* Project Browser Modal */}
      <Dialog open={showProjectBrowser} onOpenChange={onProjectBrowserChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Browse Projects</DialogTitle>
            <DialogDescription>Select a project to open</DialogDescription>
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
                  onClick={() => onOpenProject(project)}
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
      <Dialog
        open={showNewProjectDialog}
        onOpenChange={onNewProjectDialogChange}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-emerald-700">
              Unsaved Changes
            </DialogTitle>
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
                onNewProjectDialogChange(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={onConfirmNew}>Create New</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Project Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={onDeleteDialogChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Delete Project
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{projectName}&quot;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onDeleteDialogChange(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirmDelete}>
              Delete Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
