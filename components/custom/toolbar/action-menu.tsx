import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ActionMenuProps {
  hasCurrentProject: boolean;
  onBrowse: () => void;
  onDelete: () => void;
  onImportDb?: () => void;
  onNew: () => void;
}

export function ActionMenu({
  onNew,
  onBrowse,
  onDelete,
  onImportDb,
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
      <DropdownMenuTrigger onMouseEnter={handleOpen} onMouseLeave={handleClose}>
        <Button size={"sm"} variant={"ghost"}>
          Action
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="mt-1.5 w-36"
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
      >
        <DropdownMenuItem onClick={onNew}>New Project</DropdownMenuItem>
        <DropdownMenuItem onClick={onBrowse}>Browse Projects</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onImportDb?.()}>
          Import DB
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasCurrentProject} onClick={onDelete}>
          Delete Project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
