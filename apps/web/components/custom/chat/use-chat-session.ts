import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isStopped, runGenerate, runPlan } from "@/lib/ai/chat-run";
import type { ChatMessage, ChatRequest } from "@/lib/ai/chat-types";
import {
  chooseModels,
  type ExecutionPolicy,
  loadPolicy,
  savePolicy,
} from "@/lib/ai/execution-policy";
import { schemaModel } from "@/lib/ai/schema-model";
import { db } from "@/lib/db";
import { createCheckpoint } from "@/lib/versions";
import { getAISettings } from "../api-settings-dialog";

interface UseChatSessionArgs {
  /** The schema in the editor right now. */
  dbml: string;
  isOpen: boolean;
  onNeedSettings: () => void;
  onSchemaGenerated: (dbml: string) => void | Promise<void>;
  projectId?: string;
  techStack: Record<string, string | null> | null;
}

const newId = (suffix: string) =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${suffix}`;

const isBusy = (message: ChatMessage) =>
  message.phase === "WORKING" || message.phase === "GENERATING";

export function useChatSession({
  dbml,
  isOpen,
  onNeedSettings,
  onSchemaGenerated,
  projectId,
  techStack,
}: UseChatSessionArgs) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [policy, setPolicyState] = useState<ExecutionPolicy>(() =>
    loadPolicy()
  );
  const controllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const dbmlRef = useRef(dbml);
  const policyRef = useRef(policy);
  const loadedFor = useRef<string | undefined>(undefined);

  messagesRef.current = messages;
  dbmlRef.current = dbml;
  policyRef.current = policy;

  const isWorking = messages.some(isBusy);

  const setPolicy = (next: ExecutionPolicy) => {
    setPolicyState(next);
    savePolicy(next);
  };

  // Load this project's chat. A run cannot survive a reload, so work that was
  // in progress is shown as stopped, with Retry.
  useEffect(() => {
    if (!isOpen) return;
    if (!projectId) {
      loadedFor.current = undefined;
      setMessages([]);
      return;
    }
    let cancelled = false;
    db.projects
      .get(projectId)
      .then((project) => {
        if (cancelled) return;
        loadedFor.current = projectId;
        setMessages(
          (project?.aiChatHistory ?? []).map((message) =>
            isBusy(message)
              ? {
                  ...message,
                  content: "This was interrupted. Nothing was changed.",
                  phase: "STOPPED" as const,
                }
              : message
          )
        );
      })
      .catch((error) => console.error("Failed to load chat history:", error));
    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId]);

  // Save the chat with the project.
  useEffect(() => {
    if (!projectId || loadedFor.current !== projectId) return;
    db.projects
      .update(projectId, { aiChatHistory: messages })
      .catch((error) => console.error("Failed to save chat history:", error));
  }, [messages, projectId]);

  const update = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((previous) =>
      previous.map((message) =>
        message.id === id ? { ...message, ...patch } : message
      )
    );
  }, []);

  const addStep = useCallback((id: string, label: string) => {
    setMessages((previous) =>
      previous.map((message) => {
        if (message.id !== id) return message;
        const steps = message.steps ?? [];
        if (steps.at(-1)?.label === label) return message;
        return { ...message, steps: [...steps, { at: Date.now(), label }] };
      })
    );
  }, []);

  /** Builds the model for one run, from the policy and the request. */
  const buildModel = async (message: string, signal: AbortSignal) => {
    const settings = await getAISettings();
    if (!settings?.vercelAIKey) {
      onNeedSettings();
      throw new Error("Add your AI Gateway key in AI Settings first.");
    }
    const chosen = chooseModels(policyRef.current, {
      dbml: dbmlRef.current,
      message,
    });
    return schemaModel(chosen.capable, settings.vercelAIKey, {
      fastModelKey: chosen.fast,
      reasoningEffort: chosen.reasoningEffort,
      signal,
    });
  };

  const fail = (id: string, error: unknown, stage: "generate" | "plan") => {
    if (isStopped(error)) {
      update(id, {
        content: "Stopped. Nothing was changed.",
        failedStage: stage,
        phase: "STOPPED",
      });
      return;
    }
    const text =
      error instanceof Error ? error.message : "Something went wrong.";
    toast.error(text);
    update(id, { content: text, failedStage: stage, phase: "ERROR" });
  };

  const startGenerate = async (id: string) => {
    const message = messagesRef.current.find((m) => m.id === id);
    if (!(message?.plan && message.request)) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const startedAt = Date.now();
    const before = dbmlRef.current;
    update(id, {
      content: "",
      failedStage: undefined,
      phase: "GENERATING",
      planStatus: "approved",
      proposal: undefined,
    });
    try {
      const model = await buildModel(
        message.request.message,
        controller.signal
      );
      const proposal = await runGenerate({
        dbml: before,
        model,
        onProgress: (label) => addStep(id, label),
        plan: message.plan,
        retrievedContext: message.retrievedContext ?? "",
        signal: controller.signal,
      });
      update(id, {
        content: proposal.valid
          ? "Here is the schema. It parses and passes the checks."
          : "I could not produce a valid schema, so nothing was applied.",
        phase: "DONE",
        previousDbml: before,
        proposal,
        thinkingMs: Date.now() - startedAt,
      });
    } catch (error) {
      fail(id, error, "generate");
    }
  };

  const startPlan = async (id: string, request: ChatRequest) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const startedAt = Date.now();
    update(id, {
      content: "",
      failedStage: undefined,
      phase: "WORKING",
      request,
      steps: [],
    });
    try {
      const model = await buildModel(request.message, controller.signal);
      const step = await runPlan({
        dbml: dbmlRef.current,
        message: request.message,
        model,
        onProgress: (label) => addStep(id, label),
        rounds: request.rounds,
        signal: controller.signal,
        techStack,
      });
      const thinkingMs = Date.now() - startedAt;
      if (step.kind === "question") {
        update(id, {
          content: "",
          phase: "NEEDS_CLARIFICATION",
          question: { options: step.options, text: step.text },
          rounds: request.rounds,
          thinkingMs,
        });
        return;
      }
      if (step.kind === "answer") {
        update(id, { content: step.text, phase: "ANSWERED", thinkingMs });
        return;
      }
      const mode = policyRef.current.mode;
      update(id, {
        content: "Here is the plan.",
        phase: "NEEDS_APPROVAL",
        plan: step.plan,
        planMarkdown: step.markdown,
        planOnly: mode === "plan",
        planStatus: "pending",
        retrievedContext: step.retrievedContext,
        thinkingMs,
      });
      // Build mode goes straight on; the result still waits for Apply.
      if (mode === "build") await startGenerate(id);
    } catch (error) {
      fail(id, error, "plan");
    }
  };

  const sendMessage = (text: string) => {
    const message = text.trim();
    if (!message || isWorking) return;
    const assistantId = newId("a");
    setMessages((previous) => [
      ...previous,
      { content: text, createdAt: Date.now(), id: newId("u"), role: "user" },
      {
        content: "",
        createdAt: Date.now(),
        id: assistantId,
        phase: "WORKING",
        role: "assistant",
      },
    ]);
    // Wait a tick so messagesRef sees the new message before the run reads it.
    queueMicrotask(() => startPlan(assistantId, { message, rounds: [] }));
  };

  const answerQuestion = (message: ChatMessage, answer: string) => {
    if (!(message.question && message.request) || isWorking) return;
    const assistantId = newId("a");
    // The question card shows the answer, so there is no separate bubble for it.
    update(message.id, { answeredValue: answer });
    setMessages((previous) => [
      ...previous,
      {
        content: "",
        createdAt: Date.now(),
        id: assistantId,
        phase: "WORKING",
        role: "assistant",
      },
    ]);
    const request: ChatRequest = {
      message: message.request.message,
      rounds: [
        ...(message.rounds ?? []),
        { answer, question: message.question.text },
      ],
    };
    queueMicrotask(() => startPlan(assistantId, request));
  };

  const approvePlan = (message: ChatMessage) => {
    if (!isWorking) startGenerate(message.id);
  };

  const rejectPlan = (message: ChatMessage) =>
    update(message.id, {
      content: "Plan rejected. Describe what you'd like differently.",
      planStatus: "rejected",
    });

  const applyProposal = async (message: ChatMessage) => {
    const { proposal } = message;
    if (!proposal?.valid) return;
    if (dbmlRef.current !== message.previousDbml) {
      toast.error(
        "The schema changed after this was written. Retry to write it against the current schema."
      );
      return;
    }
    let checkpoint: number | null = null;
    if (projectId) {
      try {
        checkpoint = (
          await createCheckpoint(
            projectId,
            message.previousDbml ?? "",
            message.request?.message ?? "change"
          )
        ).number;
      } catch (error) {
        console.error("Failed to save checkpoint:", error);
      }
    }
    await onSchemaGenerated(proposal.dbml);
    update(message.id, { applied: true, checkpoint });
    toast.success(
      checkpoint ? `Applied. Checkpoint v${checkpoint} saved.` : "Applied."
    );
  };

  const discardProposal = (message: ChatMessage) =>
    update(message.id, { discarded: true });

  const restoreCheckpoint = async (message: ChatMessage) => {
    if (message.previousDbml === undefined) return;
    await onSchemaGenerated(message.previousDbml);
    update(message.id, { restored: true });
    toast.success("Restored the schema from before this change.");
  };

  const retry = (message: ChatMessage) => {
    if (isWorking) return;
    if (message.failedStage === "generate" || message.proposal) {
      startGenerate(message.id);
    } else if (message.request) {
      startPlan(message.id, message.request);
    }
  };

  const stop = () => controllerRef.current?.abort();

  const clear = async () => {
    stop();
    setMessages([]);
    if (projectId) {
      try {
        await db.projects.update(projectId, { aiChatHistory: [] });
        toast.success("Chat history cleared");
      } catch (error) {
        console.error("Failed to clear chat history:", error);
        toast.error("Failed to clear chat history");
      }
    }
  };

  return {
    answerQuestion,
    applyProposal,
    approvePlan,
    clear,
    discardProposal,
    isWorking,
    messages,
    policy,
    rejectPlan,
    restoreCheckpoint,
    retry,
    sendMessage,
    setPolicy,
    stop,
  };
}
