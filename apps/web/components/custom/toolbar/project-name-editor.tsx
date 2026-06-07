import { useEffect, useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { db } from "@/lib/db";

interface ProjectNameEditorProps {
  onEditingChange?: (isEditing: boolean) => void;
  onNameChange: (name: string) => void;
  projectId: string;
  projectName: string;
}

export function ProjectNameEditor({
  projectName,
  projectId,
  onNameChange,
  onEditingChange,
}: ProjectNameEditorProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const debouncedName = useDebounce(projectName, 1500);

  // auto trigger when user stops typing for 1.5s
  useEffect(() => {
    if (!debouncedName) return;
    db.projects.update(projectId, {
      name: debouncedName,
      updatedAt: new Date(),
    });
  }, [debouncedName, projectId]);

  const handleEditingChange = (editing: boolean) => {
    setIsEditingName(editing);
    onEditingChange?.(editing);
  };

  return (
    <div className="flex flex-1 justify-center">
      <div className="relative min-w-50 max-w-100">
        {isEditingName ? (
          <input
            autoFocus
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-center font-medium text-foreground text-sm outline-none focus:ring-2 focus:ring-primary"
            onBlur={() => handleEditingChange(false)}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleEditingChange(false);
            }}
            type="text"
            value={projectName}
          />
        ) : (
          <button
            className="w-full truncate rounded-md border border-transparent px-3 py-1.5 font-medium text-sm transition-colors hover:bg-muted"
            onClick={() => handleEditingChange(true)}
          >
            {projectName}
          </button>
        )}
      </div>
    </div>
  );
}
