import {
  MODEL_INFO,
  MODELS,
  type ModelDefinition,
  type ModelKey,
  type ReasoningEffort,
  setLiveCatalog,
} from "./model-registory";

/**
 * Keeps the model list current without a code change. The gateway publishes
 * every model it serves, with release date, whether it can return structured
 * output and which thinking levels it accepts. The newest ones of each lab are
 * offered, and built-in models the gateway no longer serves or that have been
 * overtaken are hidden.
 */

const MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";
const CACHE_KEY = "atlas-model-catalog";
const CACHE_MS = 6 * 60 * 60 * 1000;
const DAY = 86_400;
/** A model is "recent" if it came out within this long of its lab's newest. */
const RECENT_SECONDS = 240 * DAY;
const MAX_PER_PROVIDER = 5;

const LABS: Record<string, ModelDefinition["provider"]> = {
  alibaba: "Alibaba (Qwen)",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  google: "Google",
  minimax: "MiniMax",
  moonshotai: "Moonshot (Kimi)",
  openai: "OpenAI",
  zai: "Zhipu (GLM)",
};

/** Image, audio, code-only, speed variants and dated snapshots are not for schema work. */
const NOT_FOR_SCHEMAS =
  /(image|omni|vision|banana|embed|tts|audio|speech|realtime|search|computer|transcribe|-code|code-|-exp$|-fast$|highspeed|lightning|flashx|-\d{4}$|-\d{8}$|-latest$|-preview-)/;

export interface GatewayModel {
  id: string;
  name?: string;
  reasoning_options?: { type: string; values?: string[] }[];
  released?: number;
  tags?: string[];
  type?: string;
}

const EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh"]);

function effortsOf(model: GatewayModel): ReasoningEffort[] {
  const options = model.reasoning_options ?? [];
  const effort = options.find((option) => option.type === "effort");
  if (effort?.values) {
    return [
      "automatic",
      ...(effort.values.filter((value) =>
        EFFORTS.has(value)
      ) as ReasoningEffort[]),
    ];
  }
  if (options.some((option) => option.type === "toggle")) {
    return ["automatic", "none"];
  }
  if (options.some((option) => option.type === "budget_tokens")) {
    return ["automatic", "low", "medium", "high"];
  }
  return ["automatic"];
}

function usable(model: GatewayModel): boolean {
  const lab = model.id.split("/")[0] ?? "";
  return (
    lab in LABS &&
    model.type === "language" &&
    Boolean(model.released) &&
    (model.tags ?? []).includes("structured-output")
  );
}

export interface LiveCatalog {
  /** Built-in keys to hide. */
  hide: ModelKey[];
  /** Models to add or refresh. */
  models: Record<ModelKey, ModelDefinition>;
}

/** Turns the gateway's list into what the picker should offer. Pure. */
export function buildCatalog(
  gatewayModels: GatewayModel[],
  known: Record<ModelKey, ModelDefinition> = MODEL_INFO
): LiveCatalog {
  const served = gatewayModels.filter(usable);
  const servedIds = new Set(served.map((model) => model.id));
  const knownByGatewayId = new Map(
    Object.entries(known).map(([key, model]) => [model.id, key])
  );

  const models: Record<ModelKey, ModelDefinition> = {};
  const offered = new Set<ModelKey>();

  for (const lab of Object.keys(LABS)) {
    const ofLab = served
      .filter((model) => model.id.startsWith(`${lab}/`))
      .filter(
        (model) =>
          knownByGatewayId.has(model.id) || !NOT_FOR_SCHEMAS.test(model.id)
      )
      .sort((a, b) => (b.released ?? 0) - (a.released ?? 0));
    const newest = ofLab[0]?.released ?? 0;
    const recentOnes = ofLab.filter(
      (model) => (model.released ?? 0) >= newest - RECENT_SECONDS
    );
    // Built-in models that are still recent always stay; new ones fill the rest.
    const builtIn = recentOnes.filter((model) =>
      knownByGatewayId.has(model.id)
    );
    const fresh = recentOnes
      .filter((model) => !knownByGatewayId.has(model.id))
      .slice(0, Math.max(0, MAX_PER_PROVIDER - builtIn.length));
    const recent = [...builtIn, ...fresh];
    for (const model of recent) {
      const key = knownByGatewayId.get(model.id) ?? model.id;
      offered.add(key);
      if (!(key in known)) {
        models[key] = {
          displayName: model.name?.trim() || model.id.split("/")[1] || model.id,
          id: model.id,
          provider: LABS[lab] as ModelDefinition["provider"],
          reasoningEfforts: effortsOf(model),
        };
      }
    }
  }

  const hide = Object.entries(known)
    .filter(([key, model]) => !offered.has(key) && servedIds.has(model.id))
    .map(([key]) => key);
  // Retired built-ins (the gateway no longer lists them) are hidden too.
  for (const [key, model] of Object.entries(known)) {
    if (!(servedIds.has(model.id) || hide.includes(key))) hide.push(key);
  }
  return { hide, models };
}

/**
 * The newest Claude of a size ("haiku", "sonnet" or "opus"), so Agent mode
 * moves to new releases by itself. Falls back to the built-in one.
 */
export function latestClaude(
  size: "haiku" | "sonnet" | "opus",
  fallback: ModelKey,
  ids: Record<ModelKey, string> = MODELS
): ModelKey {
  const pattern = new RegExp(`^anthropic/claude-${size}-(\\d+(?:\\.\\d+)*)$`);
  let best: { key: ModelKey; version: number[] } | undefined;
  for (const [key, id] of Object.entries(ids)) {
    const match = pattern.exec(id);
    if (!match?.[1]) continue;
    const version = match[1].split(".").map(Number);
    if (!best || compareVersions(version, best.version) > 0) {
      best = { key, version };
    }
  }
  return best?.key ?? fallback;
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function readCache(): GatewayModel[] | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    if (
      saved &&
      Date.now() - saved.at < CACHE_MS &&
      Array.isArray(saved.data)
    ) {
      return saved.data;
    }
  } catch {
    // No cache is fine.
  }
  return undefined;
}

function writeCache(data: GatewayModel[]) {
  try {
    // Only the fields the catalog needs, to keep it small.
    const slim = data.filter(usable).map((model) => ({
      id: model.id,
      name: model.name,
      reasoning_options: model.reasoning_options,
      released: model.released,
      tags: model.tags,
      type: model.type,
    }));
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ at: Date.now(), data: slim })
    );
  } catch {
    // The list is just fetched again next time.
  }
}

let started = false;

/**
 * Loads the live list once per session (cached for hours). On any failure the
 * built-in list stays as it is, so the picker always works offline.
 */
export async function refreshModelCatalog(
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  if (started) return;
  started = true;
  try {
    let data = readCache();
    if (!data) {
      const response = await fetchImpl(MODELS_URL);
      if (!response.ok) return;
      const body = (await response.json()) as { data?: GatewayModel[] };
      data = body.data;
      if (!Array.isArray(data)) return;
      writeCache(data);
    }
    const catalog = buildCatalog(data);
    setLiveCatalog(catalog.models, catalog.hide);
  } catch {
    // Offline or blocked: keep the built-in models.
  }
}
