"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatShortcut } from "@/hooks/use-keyboard-shortcuts";

interface Command {
  action: () => void;
  category: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  id: string;
  label: string;
  shortcut?: {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    description: string;
    category: string;
  };
}

interface CommandPaletteProps {
  commands: Command[];
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  commands,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredCommands = useMemo(() => {
    if (!search) {
      return commands;
    }

    const searchLower = search.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(searchLower) ||
        cmd.description?.toLowerCase().includes(searchLower) ||
        cmd.category.toLowerCase().includes(searchLower)
    );
  }, [commands, search]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  // Reset selected index when filtered commands change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, filteredCommands, selectedIndex]);

  // Reset search when opening/closing
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  let currentIndex = 0;

  return (
    <Dialog onOpenChange={onClose} open={isOpen}>
      <DialogContent
        className="top-[20vh] min-w-xl max-w-2xl translate-y-0 gap-0 p-0"
        showCloseButton={false}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 border-border border-b px-4 py-3">
          <Search className="h-5 w-5 text-muted-foreground" />
          <Input
            autoFocus
            className="h-auto flex-1 border-0 bg-transparent p-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands..."
            type="text"
            value={search}
          />
        </div>

        {/* Commands List */}
        <div className="max-h-96 overflow-y-auto p-2">
          {Object.keys(groupedCommands).length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No commands found
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div className="mb-4 last:mb-0" key={category}>
                <div className="mb-1 px-2 font-semibold text-muted-foreground text-xs">
                  {category}
                </div>
                {cmds.map((cmd) => {
                  const index = currentIndex++;
                  const isSelected = index === selectedIndex;

                  return (
                    <button
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                      key={cmd.id}
                      onClick={() => {
                        cmd.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="flex items-center gap-3">
                        <cmd.icon
                          className={`h-4 w-4 ${
                            isSelected ? "" : "text-muted-foreground"
                          }`}
                        />
                        <div>
                          <div className="font-medium">{cmd.label}</div>
                          {cmd.description && (
                            <div
                              className={`text-xs ${
                                isSelected
                                  ? "text-primary-foreground/80"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {cmd.description}
                            </div>
                          )}
                        </div>
                      </div>
                      {cmd.shortcut && (
                        <kbd
                          className={`rounded border px-2 py-0.5 font-mono text-xs ${
                            isSelected
                              ? "border-primary-foreground/30 bg-primary-foreground/20"
                              : "border-border bg-muted"
                          }`}
                        >
                          {formatShortcut(cmd.shortcut)}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-border border-t px-4 py-4 text-muted-foreground text-xs">
          <div className="flex gap-4">
            <span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">
                ↑↓
              </kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">
                Enter
              </kbd>{" "}
              Execute
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">
                Esc
              </kbd>{" "}
              Close
            </span>
          </div>
          <div>{filteredCommands.length} commands</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
