"use client";

import { Keyboard, Command as CommandIcon, Github } from "lucide-react";
import { formatShortcut } from "@/hooks/use-keyboard-shortcuts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ShortcutItem {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  category: string;
}

interface HelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: ShortcutItem[];
}

export function HelpDialog({ isOpen, onClose, shortcuts }: HelpDialogProps) {
  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce(
    (acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = [];
      }
      acc[shortcut.category].push(shortcut);
      return acc;
    },
    {} as Record<string, ShortcutItem[]>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="min-w-xl max-w-2xl max-h-[87vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Keyboard className="h-6 w-6 text-primary" />
            <div>
              <DialogTitle className="text-xl">Keyboard Shortcuts</DialogTitle>
              <DialogDescription>
                Master Enops.dev with these shortcuts
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid gap-6">
            {Object.entries(groupedShortcuts).map(([category, items]) => (
              <div key={category}>
                <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                  {category}
                </h3>
                <div className="space-y-2">
                  {items.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      <span className="text-sm">{item.description}</span>
                      <kbd className="rounded border border-border bg-card px-3 py-1.5 font-mono text-sm shadow-sm">
                        {formatShortcut(item)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Additional Info */}
          <div className="mt-8 rounded-lg border border-border bg-muted/30 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <CommandIcon className="h-4 w-4" />
              Pro Tip
            </div>
            <p className="text-sm text-muted-foreground">
              Press{" "}
              <kbd className="rounded border border-border bg-card px-2 py-0.5 font-mono text-xs">
                {formatShortcut({
                  key: "K",
                  ctrl: true,
                })}
              </kbd>{" "}
              to open the command palette and quickly access all actions with
              fuzzy search.
            </p>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Need more help?</span>
            <a
              href="https://github.com/santosh-marar/enops.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary transition-colors hover:underline"
            >
              <Github className="h-4 w-4" />
              Visit our GitHub
            </a>
          </div>
          <Button onClick={onClose}>Got it!</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
