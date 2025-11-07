import { useState } from "react";

interface ProjectNameEditorProps {
  projectName: string;
  onNameChange: (name: string) => void;
  onEditingChange?: (isEditing: boolean) => void;
}

export function ProjectNameEditor({
  projectName,
  onNameChange,
  onEditingChange,
}: ProjectNameEditorProps) {
  const [isEditingName, setIsEditingName] = useState(false);

  const handleEditingChange = (editing: boolean) => {
    setIsEditingName(editing);
    onEditingChange?.(editing);
  };

  return (
    <div className="flex flex-1 justify-center">
      <div className="relative min-w-[200px] max-w-[400px]">
        {isEditingName ? (
          <input
            type="text"
            value={projectName}
            onChange={(e) => onNameChange(e.target.value)}
            onBlur={() => handleEditingChange(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleEditingChange(false);
            }}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-center text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
        ) : (
          <button
            onClick={() => handleEditingChange(true)}
            className="w-full truncate rounded-md border border-transparent px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            {projectName}
          </button>
        )}
      </div>
    </div>
  );
}
