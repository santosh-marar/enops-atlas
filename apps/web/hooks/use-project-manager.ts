import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";

const loadDB = () => import("@/lib/db").then((mod) => ({ db: mod.db }));
const LAST_PROJECT_KEY = "enops-dev-last-project-id";

interface Project {
  id?: number;
  name: string;
  dbml: string;
  nodes?: any[];
  edges?: any[];
  createdAt: Date;
  updatedAt: Date;
}

interface UseProjectManagerProps {
  dbml: string;
  nodes: any[];
  edges: any[];
  updateFromDBML: (dbml: string, preservePositions?: boolean) => Promise<void>;
  setNodes: (nodes: any[]) => void;
  setEdges: (edges: any[]) => void;
}

export function useProjectManager({
  dbml,
  nodes,
  edges,
  updateFromDBML,
  setNodes,
  setEdges,
}: UseProjectManagerProps) {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState("Untitled Project");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Load projects
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

  // Save project
  const handleSave = useCallback(async () => {
    if (isSaving) return;

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

  // Create new project
  const handleNew = async () => {
    try {
      setCurrentProject(null);
      setProjectName("Untitled Project");
      setLastSaved(null);
      await updateFromDBML("");
      toast.success("New project created successfully!");
    } catch (error) {
      toast.error("Failed to create new project. Please try again.");
    }
  };

  // Delete project
  const handleDelete = async () => {
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
    }
  };

  // Open project
  const handleOpenProject = useCallback(
    async (project: Project) => {
      try {
        setCurrentProject(project);
        setProjectName(project.name);
        setLastSaved(project.updatedAt);

        if (project.id) {
          localStorage.setItem(LAST_PROJECT_KEY, project.id.toString());
        }

        if (project.nodes && project.nodes.length > 0) {
          setNodes(project.nodes);
        }
        if (project.edges && project.edges.length > 0) {
          setEdges(project.edges);
        }

        await updateFromDBML(
          project.dbml || "",
          project.nodes && project.nodes.length > 0
        );
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
          localStorage.removeItem(LAST_PROJECT_KEY);
        }
      } catch (error) {
        console.error("Failed to restore last project:", error);
        localStorage.removeItem(LAST_PROJECT_KEY);
      }
    };

    restoreLastProject();
  }, [handleOpenProject]);

  return {
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
  };
}
