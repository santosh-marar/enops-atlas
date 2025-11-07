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
    <div className="flex-1 text-center">
      {isEditingName ? (
        <input
          type="text"
          value={projectName}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={() => handleEditingChange(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleEditingChange(false);
          }}
          className="rounded-md border border-border bg-background px-3 py-1 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary"
          autoFocus
        />
      ) : (
        <button
          onClick={() => handleEditingChange(true)}
          className="rounded-md px-3 py-1 text-sm font-medium transition-colors hover:bg-muted"
        >
          {projectName}
        </button>
      )}
    </div>
  );
}
