"use client";

import { Command as CommandIcon, Github, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatShortcut } from "@/hooks/use-keyboard-shortcuts";

interface ShortcutItem {
  alt?: boolean;
  category: string;
  ctrl?: boolean;
  description: string;
  key: string;
  shift?: boolean;
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
    <Dialog onOpenChange={onClose} open={isOpen}>
      <DialogContent className="flex max-h-[87vh] min-w-xl max-w-2xl flex-col overflow-hidden">
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
                <h3 className="mb-3 font-semibold text-muted-foreground text-sm">
                  {category}
                </h3>
                <div className="space-y-2">
                  {items.map((item, index) => (
                    <div
                      className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3 transition-colors hover:bg-muted/50"
                      key={index}
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
            <div className="mb-2 flex items-center gap-2 font-semibold text-sm">
              <CommandIcon className="h-4 w-4" />
              Pro Tip
            </div>
            <p className="text-muted-foreground text-sm">
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
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <span>Need more help?</span>
            <a
              className="flex items-center gap-1 text-primary transition-colors hover:underline"
              href="https://github.com/santosh-marar/enops.dev"
              rel="noopener noreferrer"
              target="_blank"
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
