"use client";

import { type LucideIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface AddMenuItem {
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  shortcut?: string;
}

/** The composer's + menu: everything that adds context to the next message. */
export function AddMenu({
  disabled,
  items,
}: {
  disabled?: boolean;
  items: AddMenuItem[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Add context"
            className="h-7 w-7"
            disabled={disabled}
            size="icon"
            title="Add context"
            type="button"
            variant="ghost"
          />
        }
      >
        <Plus className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60" side="top">
        {items.map((item) => (
          <DropdownMenuItem key={item.label} onClick={item.onSelect}>
            <item.icon className="text-muted-foreground" />
            {item.label}
            {item.shortcut && (
              <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
