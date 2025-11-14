import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { nanoId } from "@/lib/id";

interface Project {
  id: string;
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
      const allProjects = await db.projects
        .orderBy("updatedAt")
        .reverse()
        .toArray();
      setProjects(allProjects);
    } catch (error) {
      // console.error("Failed to load projects:", error);
    }
  }, []);

  // Save project
  const handleSave = useCallback(async (): Promise<string | undefined> => {
    // console.log("currentProject", currentProject);

    if (isSaving) {
      return currentProject?.id;
    }

    setIsSaving(true);

    try {
      if (currentProject?.id) {
        await db.projects.update(currentProject.id, {
          name: projectName,
          dbml,
          nodes,
          edges,
          updatedAt: new Date(),
        });
        setLastSaved(new Date());
        return currentProject.id;
      } else {
        const projectToSave = {
          id: nanoId as string,
          name: projectName,
          dbml,
          nodes,
          edges,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Add to database
        await db.projects.add(projectToSave);

        setCurrentProject(projectToSave);
        localStorage.setItem("current_project_id", projectToSave.id);
        setLastSaved(new Date());
        // console.log(projectToSave.id);
        return nanoId as string;
      }
    } catch (error) {
      console.error("[handleSave] Error saving project:", error);
      toast.error("Failed to save project. Please try again.");
      return undefined;
    } finally {
      setIsSaving(false);
    }
  }, [currentProject, projectName, dbml, nodes, edges, isSaving, nanoId]);

  // Create new project
  const handleNew = async () => {
    try {
      setCurrentProject(null);
      setProjectName("Untitled Project");
      setLastSaved(null);
      localStorage.removeItem("current_project_id"); // Clear localStorage too!
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
      await db.projects.delete(currentProject.id);
      setCurrentProject(null);
      setProjectName("Untitled Project");
      setLastSaved(null);
      await updateFromDBML("");
      toast.success("Project deleted successfully!");
    } catch (error) {
      // console.error("Failed to delete project:", error);
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
          localStorage.setItem("current_project_id", project.id.toString());
        }

        if (project.nodes && project.nodes.length > 0) {
          setNodes(project.nodes);
        }
        if (project.edges && project.edges.length > 0) {
          setEdges(project.edges);
        }

        await updateFromDBML(
          project.dbml || "",
          project.nodes && project.nodes.length > 0,
        );
      } catch (error) {
        toast.error("Failed to open project. Please try again.");
      }
    },
    [setNodes, setEdges, updateFromDBML],
  );

  // Auto-restore last opened project on mount ONLY ONCE
  useEffect(() => {
    const restoreLastProject = async () => {
      try {
        const lastProjectId = localStorage.getItem("current_project_id");
        if (!lastProjectId) {
          return;
        }

        const project = await db.projects.get(lastProjectId);

        if (project) {
          await handleOpenProject(project);
        } else {
          localStorage.removeItem("current_project_id");
        }
      } catch (error) {
        localStorage.removeItem("current_project_id");
      }
    };

    restoreLastProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  return {
    currentProject,
    setCurrentProject,
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
