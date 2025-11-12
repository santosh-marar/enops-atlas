"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { db } from "@/lib/db";

export interface TechStack {
  database: string;
  orm: string;
  language: string;
  backendFramework: string;
  authLibrary: string;
  billingLibrary: string;
  description: string;
}

interface AITechStackDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (techStack: TechStack) => void;
  projectId?: string;
}

export async function getSavedTechStack(): Promise<TechStack | null> {

  const projectId = localStorage.getItem("last_project_id");
  // console.log("projectId from get tech stack", projectId);

  try {
    if (!projectId) {
      return null;
    }
    const project = await db.projects.get(projectId);

    // console.log("project tech stack", project?.techStack);

    if (project?.techStack) {
      return { ...project.techStack, description: "" };
    }

    return null;
  } catch (error) {
    console.error("Failed to get saved tech stack:", error);
    return null;
  }
}

export async function saveTechStack(
  techStack: TechStack,
  projectId: string
): Promise<void> {
  try {
    if (!projectId) {
      throw new Error(
        "Cannot save tech stack without a project ID. Please save the project first."
      );
    }

    // Get the full project
    const project = await db.projects.get(projectId);

    // console.log("project", project);

    if (!project) {
      throw new Error(`Project with ID ${projectId} not found.`);
    }

    // console.log("techStack", techStack);

    // Modify the project object
    project.techStack = {
      database: techStack.database,
      orm: techStack.orm,
      language: techStack.language,
      backendFramework: techStack.backendFramework,
      authLibrary: techStack.authLibrary,
      billingLibrary: techStack.billingLibrary,
    };
    project.updatedAt = new Date();

    // Put it back (replaces the entire record)
    await db.projects.put(project);

    // Verify it saved
    const verify = await db.projects.get(projectId);
    // console.log("Saved tech stack:", verify?.techStack);
  } catch (error) {
    console.error("Failed to save tech stack:", error);
    throw error;
  }
}

export function AITechStackDialog({
  isOpen,
  onClose,
  onGenerate,
  projectId,
}: AITechStackDialogProps) {
  const [techStack, setTechStack] = useState<TechStack>({
    database: "postgresql",
    orm: "prisma",
    language: "typescript",
    backendFramework: "nextjs",
    authLibrary: "clerk",
    billingLibrary: "stripe",
    description: "",
  });

  useEffect(() => {
    if (isOpen) {
      getSavedTechStack().then((saved) => {
        if (saved) {
          setTechStack(saved);
        } else {
          setTechStack({
            database: "postgresql",
            orm: "prisma",
            language: "typescript",
            backendFramework: "nextjs",
            authLibrary: "clerk",
            billingLibrary: "stripe",
            description: "",
          });
        }
      });
    }
  }, [isOpen, projectId]);

  const handleChange = (field: keyof TechStack, value: string) => {
    setTechStack((prev) => ({ ...prev, [field]: value }));
  };

  const handleGenerate = async () => {
    if (!techStack.description.trim()) {
      toast.error("Please provide a description of your project");
      return;
    }

    try {
      if (projectId) {
        await saveTechStack(techStack, projectId);
      }
      onGenerate(techStack);
      onClose();
    } catch (error) {
      toast.error("Failed to save tech stack");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Schema with AI</DialogTitle>
          <DialogDescription>
            Select your tech stack and describe your project. AI will generate a
            database schema for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Database */}
            <div className="space-y-2">
              <Label htmlFor="database">Database</Label>
              <select
                id="database"
                value={techStack.database}
                onChange={(e) => handleChange("database", e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="postgresql">PostgreSQL</option>
                <option value="mysql">MySQL</option>
              </select>
            </div>

            {/* ORM/ODM */}
            <div className="space-y-2">
              <Label htmlFor="orm">ORM</Label>
              <select
                id="orm"
                value={techStack.orm}
                onChange={(e) => handleChange("orm", e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="prisma">Prisma</option>
                <option value="drizzle">Drizzle ORM</option>
              </select>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <select
                id="language"
                value={techStack.language}
                onChange={(e) => handleChange("language", e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="typescript">TypeScript</option>
              </select>
            </div>

            {/* Backend Framework */}
            <div className="space-y-2">
              <Label htmlFor="backend">Backend Framework</Label>
              <select
                id="backend"
                value={techStack.backendFramework}
                onChange={(e) => handleChange("backendFramework", e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="nextjs">Next.js</option>
              </select>
            </div>

            {/* Auth Library */}
            <div className="space-y-2">
              <Label htmlFor="auth">Auth Library</Label>
              <select
                id="auth"
                value={techStack.authLibrary}
                onChange={(e) => handleChange("authLibrary", e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="clerk">Clerk</option>
                <option value="next-auth">NextAuth.js</option>
                <option value="supabase-auth">Supabase Auth</option>
                <option value="auth0">Auth0</option>
                <option value="firebase-auth">Firebase Auth</option>
                <option value="lucia">Lucia Auth</option>
                <option value="better-auth">Better Auth</option>
                <option value="custom">Custom Auth</option>
                <option value="none">None</option>
              </select>
            </div>

            {/* Billing Library */}
            <div className="space-y-2">
              <Label htmlFor="billing">Payment Provider</Label>
              <select
                id="billing"
                value={techStack.billingLibrary}
                onChange={(e) => handleChange("billingLibrary", e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="stripe">Stripe</option>
                <option value="paddle">Paddle</option>
                <option value="lemonsqueezy">Lemon Squeezy</option>
                <option value="dodo">Dodo Payments</option>
                <option value="paypal">PayPal</option>
                <option value="razorpay">Razorpay</option>
                <option value="mollie">Mollie</option>
                <option value="custom">Custom Provider</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>

          {/* Project Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Project Description *</Label>
            <Textarea
              id="description"
              value={techStack.description}
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder="Describe your project... e.g., 'A social media platform for developers with posts, comments, likes, user profiles, and direct messaging'"
              rows={6}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Provide a detailed description of your project, including key features
              and relationships.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleGenerate}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
