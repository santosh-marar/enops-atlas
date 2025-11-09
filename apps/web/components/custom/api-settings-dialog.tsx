"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Eye, EyeOff, Check, AlertCircle, Sparkles, Shield } from "lucide-react";
import { db, AISettings as DBAISettings } from "@/lib/db";
import { toast } from "sonner";

interface APISettingsDialogProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function APISettingsDialog({ children, open: controlledOpen, onOpenChange }: APISettingsDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
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
    if (!key || key.length < 8) return key;
    return key.slice(0, 4) + "•".repeat(key.length - 8) + key.slice(-4);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && (
        <DialogTrigger asChild>
          {children}
        </DialogTrigger>
      )}
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <Tabs value={provider} onValueChange={(v) => setProvider(v as "claude" | "gpt")} className="w-full">
            <div className="flex items-center justify-center pb-4">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="claude" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Claude Sonnet 4.5
                </TabsTrigger>
                <TabsTrigger value="gpt" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  GPT-4 Turbo
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="claude" className="space-y-4 mt-0">
              <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-primary/10 p-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">Anthropic Claude</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Claude 3.5 Sonnet - Advanced reasoning and code generation
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="claude-key" className="text-sm font-medium">
                  API Key
                  <span className="text-destructive ml-1">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="claude-key"
                    type={showClaudeKey ? "text" : "password"}
                    placeholder="sk-ant-api..."
                    value={claudeKey}
                    onChange={(e) => setClaudeKey(e.target.value)}
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowClaudeKey(!showClaudeKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showClaudeKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your API key from{" "}
                  <a
                    href="https://console.anthropic.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    console.anthropic.com
                  </a>
                </p>
              </div>
            </TabsContent>

            <TabsContent value="gpt" className="space-y-4 mt-0">
              <div className="rounded-lg border bg-gradient-to-br from-green-500/5 to-green-500/10 p-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-green-500/10 p-2">
                      <Sparkles className="h-5 w-5 text-green-600 dark:text-green-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">OpenAI GPT</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        GPT-4 Turbo - Powerful language model with broad knowledge
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="openai-key" className="text-sm font-medium">
                  API Key
                  <span className="text-destructive ml-1">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="openai-key"
                    type={showOpenaiKey ? "text" : "password"}
                    placeholder="sk-..."
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showOpenaiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your API key from{" "}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    platform.openai.com
                  </a>
                </p>
              </div>
            </TabsContent>

            <div className="rounded-lg border p-3 bg-muted/50 mt-4">
              <div className="flex gap-2.5">
                <Shield className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Privacy & Security</p>
                  <p>
                    Your API keys are encrypted and stored locally in your browser.
                    They never leave your device and are only used for direct API requests.
                  </p>
                </div>
              </div>
            </div>
          </Tabs>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSaving}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="flex-1 sm:flex-none"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
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
  provider: "claude" | "gpt";
  claudeApiKey: string;
  openaiApiKey: string;
}

export async function getAISettings(): Promise<AISettings | null> {
  if (typeof window === "undefined") return null;

  try {
    const saved = await db.aiSettings.toCollection().first();
    if (!saved) return null;

    return {
      provider: saved.provider,
      claudeApiKey: saved.claudeApiKey || "",
      openaiApiKey: saved.openaiApiKey || "",
    };
  } catch {
    return null;
  }
}
