import { useState } from "react";

interface ProjectNameEditorProps {
  onEditingChange?: (isEditing: boolean) => void;
  onNameChange: (name: string) => void;
  projectName: string;
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
            autoFocus
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-center font-medium text-foreground text-sm outline-none focus:ring-2 focus:ring-primary"
            onBlur={() => handleEditingChange(false)}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleEditingChange(false);
              }
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
