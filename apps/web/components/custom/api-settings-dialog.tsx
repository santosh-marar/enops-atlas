"use client";

import { Eye, EyeOff, Settings, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AISettings as DBAISettings, db } from "@/lib/db";

interface APISettingsDialogProps {
  children?: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}

export function APISettingsDialog({
  children,
  open: controlledOpen,
  onOpenChange,
}: APISettingsDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen === undefined ? internalOpen : controlledOpen;
  const setOpen = (value: boolean) => {
    if (onOpenChange) {
      onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };

  const [vercelAIKey, setVercelAIKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const settings = await db.aiSettings.toArray();
      if (settings.length > 0) {
        setVercelAIKey(settings[0].vercelAIKey || "");
      }
    } catch {
      toast.error("Failed to load API settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!vercelAIKey.trim()) {
      toast.error("Please enter your Vercel AI Gateway key");
      return;
    }

    try {
      setIsSaving(true);

      const settings: DBAISettings = {
        vercelAIKey: vercelAIKey.trim(),
        updatedAt: new Date(),
      };

      const existing = await db.aiSettings.toArray();
      if (existing.length > 0) {
        await db.aiSettings.update(existing[0].id!, settings);
      } else {
        await db.aiSettings.add(settings);
      }

      toast.success("AI key saved successfully");
      setOpen(false);
    } catch {
      toast.error("Failed to save AI key");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <Settings className="h-4 w-4 text-primary" />
            </div>
            AI Settings
          </DialogTitle>
          <DialogDescription>
            Configure your Vercel AI Gateway credentials
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-primary border-b-2" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="font-medium text-sm" htmlFor="vercel-ai-key">
                Vercel AI Gateway Key
                <span className="ml-1 text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  className="pr-10 font-mono text-sm"
                  id="vercel-ai-key"
                  onChange={(e) => setVercelAIKey(e.target.value)}
                  placeholder="vai-..."
                  type={showKey ? "text" : "password"}
                  value={vercelAIKey}
                />
                <button
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setShowKey(!showKey)}
                  type="button"
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-muted-foreground text-xs">
                Get your key from{" "}
                <a
                  className="font-medium text-primary hover:underline"
                  href="https://vercel.com/docs/ai-gateway"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  vercel.com/docs/ai-gateway
                </a>
              </p>
            </div>

            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex gap-2.5">
                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="space-y-1 text-muted-foreground text-xs">
                  <p className="font-medium text-foreground">
                    Privacy & Security
                  </p>
                  <p>
                    Your key is stored locally in your browser and never leaves
                    your device.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            className="flex-1 sm:flex-none"
            disabled={isSaving}
            onClick={() => setOpen(false)}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            disabled={isSaving || isLoading}
            onClick={handleSave}
          >
            {isSaving ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-primary-foreground border-b-2" />
                Saving...
              </>
            ) : (
              <>Save</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface AISettings {
  vercelAIKey: string;
}

export async function getAISettings(): Promise<AISettings | null> {
  if (typeof window === "undefined") return null;

  try {
    const saved = await db.aiSettings.toCollection().first();
    if (!saved) return null;
    return { vercelAIKey: saved.vercelAIKey || "" };
  } catch {
    return null;
  }
}
