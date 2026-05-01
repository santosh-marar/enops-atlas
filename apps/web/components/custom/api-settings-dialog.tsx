"use client";

import { Check, Eye, EyeOff, Settings, Shield, Sparkles } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [provider, setProvider] = useState<"claude" | "gpt">("claude");
  const [claudeKey, setClaudeKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
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
        const current = settings[0];
        setProvider(current.provider);
        setClaudeKey(current.claudeApiKey || "");
        setOpenaiKey(current.openaiApiKey || "");
      }
    } catch (error) {
      // console.error("Failed to load API settings:", error);
      toast.error("Failed to load API settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      if (provider === "claude" && !claudeKey.trim()) {
        toast.error("Please enter Claude API key");
        return;
      }

      if (provider === "gpt" && !openaiKey.trim()) {
        toast.error("Please enter OpenAI API key");
        return;
      }

      const settings: DBAISettings = {
        provider,
        claudeApiKey: claudeKey.trim() || undefined,
        openaiApiKey: openaiKey.trim() || undefined,
        updatedAt: new Date(),
      };

      const existing = await db.aiSettings.toArray();
      if (existing.length > 0) {
        await db.aiSettings.update(existing[0].id!, settings);
      } else {
        await db.aiSettings.add(settings);
      }

      toast.success("API settings saved successfully");
      setOpen(false);
    } catch (error) {
      // console.error("Failed to save API settings:", error);
      toast.error("Failed to save API settings");
    } finally {
      setIsSaving(false);
    }
  };

  const maskKey = (key: string) => {
    if (!key || key.length < 8) {
      return key;
    }
    return key.slice(0, 4) + "•".repeat(key.length - 8) + key.slice(-4);
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
            Configure your preferred AI provider and API credentials
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-primary border-b-2" />
          </div>
        ) : (
          <Tabs
            className="w-full"
            onValueChange={(v) => setProvider(v as "claude" | "gpt")}
            value={provider}
          >
            <div className="flex items-center justify-center pb-4">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger className="gap-2" value="claude">
                  <Sparkles className="h-4 w-4" />
                  Claude Sonnet 4.5
                </TabsTrigger>
                <TabsTrigger className="gap-2" value="gpt">
                  <Sparkles className="h-4 w-4" />
                  GPT-4 Turbo
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent className="mt-0 space-y-4" value="claude">
              <div className="rounded-lg border bg-linear-to-br from-primary/5 to-primary/10 p-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">
                        Anthropic Claude
                      </h3>
                      <p className="mt-0.5 text-muted-foreground text-xs">
                        Claude 3.5 Sonnet - Advanced reasoning and code
                        generation
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-medium text-sm" htmlFor="claude-key">
                  API Key
                  <span className="ml-1 text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    className="pr-10 font-mono text-sm"
                    id="claude-key"
                    onChange={(e) => setClaudeKey(e.target.value)}
                    placeholder="sk-ant-api..."
                    type={showClaudeKey ? "text" : "password"}
                    value={claudeKey}
                  />
                  <button
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setShowClaudeKey(!showClaudeKey)}
                    type="button"
                  >
                    {showClaudeKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Get your API key from{" "}
                  <a
                    className="font-medium text-primary hover:underline"
                    href="https://console.anthropic.com/"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    console.anthropic.com
                  </a>
                </p>
              </div>
            </TabsContent>

            <TabsContent className="mt-0 space-y-4" value="gpt">
              <div className="rounded-lg border bg-linear-to-br from-green-500/5 to-green-500/10 p-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-green-500/10 p-2">
                      <Sparkles className="h-5 w-5 text-green-600 dark:text-green-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">OpenAI GPT</h3>
                      <p className="mt-0.5 text-muted-foreground text-xs">
                        GPT-4 Turbo - Powerful language model with broad
                        knowledge
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-medium text-sm" htmlFor="openai-key">
                  API Key
                  <span className="ml-1 text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    className="pr-10 font-mono text-sm"
                    id="openai-key"
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-..."
                    type={showOpenaiKey ? "text" : "password"}
                    value={openaiKey}
                  />
                  <button
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                    type="button"
                  >
                    {showOpenaiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Get your API key from{" "}
                  <a
                    className="font-medium text-primary hover:underline"
                    href="https://platform.openai.com/api-keys"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    platform.openai.com
                  </a>
                </p>
              </div>
            </TabsContent>

            <div className="mt-4 rounded-lg border bg-muted/50 p-3">
              <div className="flex gap-2.5">
                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="space-y-1 text-muted-foreground text-xs">
                  <p className="font-medium text-foreground">
                    Privacy & Security
                  </p>
                  <p>
                    Your API keys are encrypted and stored locally in your
                    browser. They never leave your device and are only used for
                    direct API requests.
                  </p>
                </div>
              </div>
            </div>
          </Tabs>
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
              <>
                <Check className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface AISettings {
  claudeApiKey: string;
  openaiApiKey: string;
  provider: "claude" | "gpt";
}

export async function getAISettings(): Promise<AISettings | null> {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const saved = await db.aiSettings.toCollection().first();
    if (!saved) {
      return null;
    }

    return {
      provider: saved.provider,
      claudeApiKey: saved.claudeApiKey || "",
      openaiApiKey: saved.openaiApiKey || "",
    };
  } catch {
    return null;
  }
}
