import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ActionMenuProps {
  hasCurrentProject: boolean;
  onBrowse: () => void;
  onDelete: () => void;
  onHistory: () => void;
  onImportDb?: () => void;
  onNew: () => void;
  onNewVersion: () => void;
}

export function ActionMenu({
  onNew,
  onBrowse,
  onDelete,
  onHistory,
  onImportDb,
  onNewVersion,
  hasCurrentProject,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  const handleOpen = () => {
    clearTimeout(closeTimeoutRef.current);
    setOpen(true);
  };

  const handleClose = () => {
    closeTimeoutRef.current = setTimeout(() => setOpen(false), 100);
  };

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
        render={<Button size="sm" variant="ghost" />}
      >
        Action
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="mt-1.5 w-40"
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
      >
        <DropdownMenuItem onClick={onNew}>New Project</DropdownMenuItem>
        <DropdownMenuItem onClick={onBrowse}>Browse Projects</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onImportDb?.()}>
          Import DB
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onNewVersion}>New Version</DropdownMenuItem>
        <DropdownMenuItem disabled={!hasCurrentProject} onClick={onHistory}>
          Version History
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!hasCurrentProject} onClick={onDelete}>
          Delete Project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
