import {
  Bot,
  Check,
  ChevronDown,
  Hammer,
  ListChecks,
  Route,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ExecutionPolicy } from "@/lib/ai/execution-policy";
import { refreshModelCatalog } from "@/lib/ai/live-models";
import {
  catalogVersion,
  type ModelKey,
  modelInfo,
  PROVIDERS,
  REASONING_LABEL,
  type ReasoningEffort,
  subscribeCatalog,
  visibleModelKeys,
} from "@/lib/ai/model-registory";

const MODES = [
  {
    description: "Plan first, then ask before writing the schema.",
    icon: Route,
    label: "Auto",
    value: "auto",
  },
  {
    description: "Only make a plan. Nothing is written.",
    icon: ListChecks,
    label: "Plan",
    value: "plan",
  },
  {
    description:
      "Plan and write the schema straight away. You still review it before it is applied.",
    icon: Hammer,
    label: "Build",
    value: "build",
  },
] as const;

const COMPLEXITY = [
  { label: "Auto: from the task", value: "auto" },
  { label: "Fast: small and obvious", value: "fast" },
  { label: "Balanced: normal work", value: "balanced" },
  { label: "Deep: broad or risky", value: "deep" },
] as const;

const COMPLEXITY_NAME: Record<ExecutionPolicy["complexity"], string> = {
  auto: "Auto",
  balanced: "Balanced",
  deep: "Deep",
  fast: "Fast",
};

const effortLabel = (effort: ReasoningEffort) => REASONING_LABEL[effort];

/** The models on offer. It updates itself once the live list arrives. */
function useModelKeys(): ModelKey[] {
  useSyncExternalStore(subscribeCatalog, catalogVersion, catalogVersion);
  useEffect(() => {
    refreshModelCatalog();
  }, []);
  return visibleModelKeys();
}

/** What the model chip says: who chooses, or which model and how hard it thinks. */
function modelSummary(value: ExecutionPolicy) {
  if (value.control === "manual" && value.modelKey) {
    const name = modelInfo(value.modelKey).displayName;
    return value.reasoningEffort === "automatic"
      ? name
      : `${name} · ${value.reasoningEffort}`;
  }
  return `Agent · ${COMPLEXITY_NAME[value.complexity]}`;
}

function ModeMenu({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (value: ExecutionPolicy) => void;
  value: ExecutionPolicy;
}) {
  const current = MODES.find((mode) => mode.value === value.mode) ?? MODES[0];
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={
          <Button
            aria-label={`Mode: ${current.label}`}
            className="h-8 gap-1.5 px-2 text-xs"
            title={current.description}
            type="button"
            variant="ghost"
          />
        }
      >
        <Icon className="size-3.5" />
        {current.label}
        <ChevronDown className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72"
        side="top"
        sideOffset={8}
      >
        {MODES.map((mode) => {
          const ModeIcon = mode.icon;
          return (
            <DropdownMenuItem
              className="items-start gap-2 py-2"
              key={mode.value}
              onClick={() => onChange({ ...value, mode: mode.value })}
            >
              <ModeIcon className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1">
                <span className="block font-medium">{mode.label}</span>
                <span className="block text-muted-foreground text-xs">
                  {mode.description}
                </span>
              </span>
              {mode.value === value.mode && (
                <Check className="mt-0.5 size-4 shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModelSettings({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (value: ExecutionPolicy) => void;
  value: ExecutionPolicy;
}) {
  const liveKeys = useModelKeys();
  // A saved choice that has since dropped out of the list stays selectable.
  const modelKeys =
    value.modelKey && !liveKeys.includes(value.modelKey)
      ? [...liveKeys, value.modelKey]
      : liveKeys;
  const patch = (next: Partial<ExecutionPolicy>) =>
    onChange({ ...value, ...next });
  const efforts = value.modelKey
    ? modelInfo(value.modelKey).reasoningEfforts
    : (["automatic"] as ReasoningEffort[]);
  const manual = value.control === "manual";

  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            aria-label="Model settings"
            className="h-8 min-w-0 gap-1.5 px-2 text-xs"
            title="Choose how the model is picked"
            type="button"
            variant="ghost"
          />
        }
      >
        {manual ? (
          <SlidersHorizontal className="size-3.5 shrink-0" />
        ) : (
          <Bot className="size-3.5 shrink-0" />
        )}
        <span className="truncate">{modelSummary(value)}</span>
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <Button
              aria-pressed={!manual}
              className="h-7 text-xs"
              onClick={() => patch({ control: "agent" })}
              type="button"
              variant={manual ? "ghost" : "secondary"}
            >
              <Bot className="mr-1 size-3.5" /> Agent
            </Button>
            <Button
              aria-pressed={manual}
              className="h-7 text-xs"
              onClick={() =>
                patch({
                  control: "manual",
                  modelKey: value.modelKey ?? "claude-sonnet-5-5",
                  reasoningEffort: "automatic",
                })
              }
              type="button"
              variant={manual ? "secondary" : "ghost"}
            >
              <SlidersHorizontal className="mr-1 size-3.5" /> Manual
            </Button>
          </div>

          {manual ? (
            <div className="space-y-2">
              <Select
                items={modelKeys.map((key) => ({
                  label: modelInfo(key).displayName,
                  value: key,
                }))}
                onValueChange={(next) => {
                  if (!next) return;
                  const modelKey = next as ModelKey;
                  patch({
                    modelKey,
                    reasoningEffort: modelInfo(
                      modelKey
                    ).reasoningEfforts.includes(value.reasoningEffort)
                      ? value.reasoningEffort
                      : "automatic",
                  });
                }}
                value={value.modelKey}
              >
                <SelectTrigger
                  aria-label="Model"
                  className="h-8 w-full text-xs"
                >
                  <SelectValue placeholder="Choose model" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {PROVIDERS.map((provider) => (
                    <SelectGroup key={provider}>
                      <SelectLabel>{provider}</SelectLabel>
                      {modelKeys
                        .filter((key) => modelInfo(key).provider === provider)
                        .map((key) => (
                          <SelectItem key={key} value={key}>
                            {modelInfo(key).displayName}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Select
                disabled={efforts.length === 1}
                items={efforts.map((effort) => ({
                  label: effortLabel(effort),
                  value: effort,
                }))}
                onValueChange={(next) =>
                  next && patch({ reasoningEffort: next as ReasoningEffort })
                }
                value={value.reasoningEffort}
              >
                <SelectTrigger
                  aria-label="Thinking"
                  className="h-8 w-full text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {efforts.map((effort) => (
                    <SelectItem key={effort} value={effort}>
                      {effortLabel(effort)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {efforts.length === 1
                  ? "This model decides how much to think on its own."
                  : "Used for the plan and the schema."}{" "}
                Every step uses this model.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Select
                items={COMPLEXITY}
                onValueChange={(next) =>
                  next &&
                  patch({ complexity: next as ExecutionPolicy["complexity"] })
                }
                value={value.complexity}
              >
                <SelectTrigger
                  aria-label="Task size"
                  className="h-8 w-full text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPLEXITY.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                The app picks the model for each request. Quick steps always use
                a fast model.
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** One row: the mode, and the model. Everything else is one click away. */
export function ExecutionControls({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (value: ExecutionPolicy) => void;
  value: ExecutionPolicy;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <ModeMenu disabled={disabled} onChange={onChange} value={value} />
      <span className="h-4 w-px shrink-0 bg-border" />
      <ModelSettings disabled={disabled} onChange={onChange} value={value} />
    </div>
  );
}
