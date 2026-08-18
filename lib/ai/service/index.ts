import { generateText, streamText } from "ai";
import { resolveModel } from "../provider";
import type { AIBaseOptions } from "../types";

//  Resuable ai function
export function streamAI(opts: AIBaseOptions & { apiKey: string }) {
  return streamText({
    maxOutputTokens: opts.maxOutputTokens || 4096,
    messages: opts.messages,
    model: resolveModel(opts.modelKey, opts.apiKey),
    system: opts.system,
    temperature: opts.temperature || 0.1,
    toolChoice: opts.toolChoice,
    tools: opts.tools,
  });
}

export async function generateAI(opts: AIBaseOptions & { apiKey: string }) {
  const result = await generateText({
    maxOutputTokens: opts.maxOutputTokens || 4096,
    messages: opts.messages,
    model: resolveModel(opts.modelKey, opts.apiKey),
    system: opts.system,
    temperature: opts.temperature || 0.1,
    toolChoice: opts.toolChoice,
    tools: opts.tools,
  });

  return {
    text: result.text,
    toolCalls: result.toolCalls,
  };
}

export function streamRaw(opts: AIBaseOptions & { apiKey: string }) {
  return streamText({
    maxOutputTokens: opts.maxOutputTokens || 4096,
    messages: opts.messages,
    model: resolveModel(opts.modelKey, opts.apiKey),
    system: opts.system,
    temperature: opts.temperature || 0.1,
    toolChoice: opts.toolChoice,
    tools: opts.tools,
  });
}
