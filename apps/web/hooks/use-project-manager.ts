import type { Edge, Node } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SAMPLE_DBML } from "@/data/sample-dbml";
import { db, type Project } from "@/lib/db";
import { nanoId } from "@/lib/id";

interface UseProjectManagerProps {
  dbml: string;
  edges: Edge[];
  nodes: Node[];
  setEdges: (edges: Edge[]) => void;
  setNodes: (nodes: Node[]) => void;
  updateFromDBML: (dbml: string, preservePositions?: boolean) => Promise<void>;
}

export function useProjectManager(props: UseProjectManagerProps) {
  const [currentProject, setProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState("Untitled Project");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const active = useRef<Project | null>(null);
  const latest = useRef({ ...props, projectName });
  latest.current = { ...props, projectName };
  const pendingSave = useRef<Promise<string | undefined> | null>(null);
  const selectionVersion = useRef(0);

  const setCurrentProject = useCallback((project: Project | null) => {
    active.current = project;
    setProject(project);
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await db.projects.orderBy("updatedAt").reverse().toArray());
    } catch {
      toast.error("Failed to load projects.");
    }
  }, []);

  const handleSave = useCallback((): Promise<string | undefined> => {
    if (pendingSave.current) return pendingSave.current;
    setIsSaving(true);
    const project = active.current;
    const { dbml, edges, nodes, projectName: name } = latest.current;
    const updatedAt = new Date();
    const save = async () => {
      try {
        const id = project?.id ?? nanoId();
        if (project) {
          const count = await db.projects.update(id, {
            dbml,
            edges,
            name,
            nodes,
            updatedAt,
          });
          if (count !== 1)
            throw new Error("The active project no longer exists");
        } else {
          const created: Project = {
            createdAt: updatedAt,
            dbml,
            edges,
            id,
            name,
            nodes,
            updatedAt,
          };
          await db.projects.add(created);
          setCurrentProject(created);
        }
        localStorage.setItem("current_project_id", id);
        setLastSaved(updatedAt);
        return id;
      } catch {
        toast.error("Failed to save project. Please try again.");
      } finally {
        setIsSaving(false);
        pendingSave.current = null;
      }
    };
    pendingSave.current = save();
    return pendingSave.current;
  }, [setCurrentProject]);

  const handleNew = useCallback(async () => {
    selectionVersion.current += 1;
    await pendingSave.current;
    await latest.current.updateFromDBML("");
    setCurrentProject(null);
    setProjectName("Untitled Project");
    setLastSaved(null);
    localStorage.removeItem("current_project_id");
  }, [setCurrentProject]);

  const handleDelete = useCallback(async () => {
    selectionVersion.current += 1;
    await pendingSave.current;
    const project = active.current;
    if (!project) return;
    try {
      await db.projects.delete(project.id);
      await handleNew();
      await loadProjects();
      toast.success("Project deleted successfully!");
    } catch {
      toast.error("Failed to delete project. Please try again.");
    }
  }, [handleNew, loadProjects]);

  const handleOpenProject = useCallback(
    async (project: Project) => {
      selectionVersion.current += 1;
      await pendingSave.current;
      try {
        // Validate and replace the schema before selecting the persisted project.
        await latest.current.updateFromDBML(project.dbml || "");
        if (project.nodes?.length) latest.current.setNodes(project.nodes);
        if (project.edges?.length) latest.current.setEdges(project.edges);
        setCurrentProject(project);
        setProjectName(project.name);
        setLastSaved(project.updatedAt);
        localStorage.setItem("current_project_id", project.id);
      } catch {
        toast.error("Failed to open project. Please try again.");
      }
    },
    [setCurrentProject]
  );

  useEffect(() => {
    let cancelled = false;
    const version = selectionVersion.current;
    const restore = async () => {
      try {
        const id = localStorage.getItem("current_project_id");
        const project = id ? await db.projects.get(id) : undefined;
        if (cancelled || selectionVersion.current !== version) return;
        if (project) await handleOpenProject(project);
        else {
          localStorage.removeItem("current_project_id");
          if (!latest.current.dbml)
            await latest.current.updateFromDBML(SAMPLE_DBML);
        }
      } catch {
        if (!cancelled) toast.error("Failed to restore the last project.");
      }
    };
    restore();
    return () => {
      cancelled = true;
    };
  }, [handleOpenProject]);

  return {
    currentProject,
    handleDelete,
    handleNew,
    handleOpenProject,
    handleSave,
    isSaving,
    lastSaved,
    loadProjects,
    projectName,
    projects,
    setCurrentProject,
    setProjectName,
  };
}
