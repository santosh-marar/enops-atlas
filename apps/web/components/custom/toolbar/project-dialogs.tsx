import { FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Project {
  createdAt: Date;
  dbml: string;
  edges?: any[];
  id?: string;
  name: string;
  nodes?: any[];
  updatedAt: Date;
}

interface ProjectDialogsProps {
  onConfirmDelete: () => void;
  onConfirmNew: () => void;
  onDeleteDialogChange: (show: boolean) => void;
  onNewProjectDialogChange: (show: boolean) => void;
  onOpenProject: (project: Project) => void;
  onProjectBrowserChange: (show: boolean) => void;
  projectName: string;
  projects: Project[];

  // Delete dialog
  showDeleteDialog: boolean;

  // New project dialog
  showNewProjectDialog: boolean;
  // Browser dialog
  showProjectBrowser: boolean;
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
      <Dialog onOpenChange={onProjectBrowserChange} open={showProjectBrowser}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Browse Projects</DialogTitle>
            <DialogDescription>Select a project to open</DialogDescription>
          </DialogHeader>

          <div className="max-h-96 space-y-2 overflow-y-auto">
            {projects.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">
                No projects found. Create your first project!
              </p>
            ) : (
              projects.map((project) => (
                <button
                  className="flex w-full items-center justify-between rounded-md border border-border p-3 text-left transition-colors hover:bg-muted"
                  key={project.id}
                  onClick={() => onOpenProject(project)}
                >
                  <div>
                    <div className="font-medium">{project.name}</div>
                    <div className="text-muted-foreground text-xs">
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
        onOpenChange={onNewProjectDialogChange}
        open={showNewProjectDialog}
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
              onClick={() => {
                toast.info("Canceled creating new project");
                onNewProjectDialogChange(false);
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={onConfirmNew}>Create New</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Project Confirmation Dialog */}
      <Dialog onOpenChange={onDeleteDialogChange} open={showDeleteDialog}>
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
              onClick={() => onDeleteDialogChange(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={onConfirmDelete} variant="destructive">
              Delete Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
