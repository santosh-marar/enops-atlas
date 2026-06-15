import { generateText, streamText } from "ai";
import { resolveModel } from "../provider";
import type { AIBaseOptions } from "../types";

//  Resuable ai function
export function streamAI(opts: AIBaseOptions & { apiKey: string }) {
  return streamText({
    model: resolveModel(opts.modelKey, opts.apiKey),
    system: opts.system,
    messages: opts.messages,
    maxOutputTokens: opts.maxOutputTokens || 4096,
    temperature: opts.temperature || 0.1,
    tools: opts.tools,
    toolChoice: opts.toolChoice,
  });
}

export async function generateAI(opts: AIBaseOptions & { apiKey: string }) {
  const result = await generateText({
    model: resolveModel(opts.modelKey, opts.apiKey),
    system: opts.system,
    messages: opts.messages,
    maxOutputTokens: opts.maxOutputTokens || 4096,
    temperature: opts.temperature || 0.1,
    tools: opts.tools,
    toolChoice: opts.toolChoice,
  });

  return {
    text: result.text,
    toolCalls: result.toolCalls,
  };
}

export function streamRaw(opts: AIBaseOptions & { apiKey: string }) {
  return streamText({
    model: resolveModel(opts.modelKey, opts.apiKey),
    system: opts.system,
    messages: opts.messages,
    maxOutputTokens: opts.maxOutputTokens || 4096,
    temperature: opts.temperature || 0.1,
    tools: opts.tools,
    toolChoice: opts.toolChoice,
  });
}
