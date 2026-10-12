import { ChevronDown, Cpu, Hammer, ListChecks, Route } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/** Thinking levels offered while the app picks the model; a model that lacks one ignores it. */
const AGENT_THINKING: ReasoningEffort[] = [
  "automatic",
  "none",
  "low",
  "medium",
  "high",
];
const REASONING_SHORT: Record<ReasoningEffort, string> = {
  automatic: "Auto",
  high: "High",
  low: "Low",
  medium: "Medium",
  minimal: "Min",
  none: "Off",
  xhigh: "Max",
};

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
  { label: "Auto", value: "auto" },
  { label: "Fast", value: "fast" },
  { label: "Balanced", value: "balanced" },
  { label: "Deep", value: "deep" },
] as const;

/** The next mode, for cycling with Alt+M. */
export function nextMode(mode: ExecutionPolicy["mode"]) {
  const index = MODES.findIndex((option) => option.value === mode);
  return MODES[(index + 1) % MODES.length]?.value ?? "auto";
}

/** The models on offer. It updates itself once the live list arrives. */
function useModelKeys(): ModelKey[] {
  useSyncExternalStore(subscribeCatalog, catalogVersion, catalogVersion);
  useEffect(() => {
    refreshModelCatalog();
  }, []);
  return visibleModelKeys();
}

function Trigger({
  children,
  disabled,
  title,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  title: string;
}) {
  return (
    <DropdownMenuTrigger
      disabled={disabled}
      render={
        <Button
          className="h-7 gap-1 px-2 font-normal text-muted-foreground text-xs hover:text-foreground"
          title={title}
          type="button"
          variant="ghost"
        />
      }
    >
      {children}
      <ChevronDown className="size-3 opacity-60" />
    </DropdownMenuTrigger>
  );
}

export function ModePicker({
  disabled,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (value: ExecutionPolicy) => void;
  value: ExecutionPolicy;
}) {
  const current = MODES.find((mode) => mode.value === value.mode) ?? MODES[0];
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <Trigger disabled={disabled} title="Mode (Alt+M to switch)">
        <Icon className="size-3.5" />
        <span className="text-foreground">{current.label}</span>
      </Trigger>
      <DropdownMenuContent align="start" className="w-72" side="top">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(mode) =>
              onChange({ ...value, mode: mode as ExecutionPolicy["mode"] })
            }
            value={value.mode}
          >
            {MODES.map((mode) => (
              <DropdownMenuRadioItem
                className="items-start py-1.5"
                key={mode.value}
                value={mode.value}
              >
                <mode.icon className="mt-0.5" />
                <span className="flex flex-col">
                  <span>{mode.label}</span>
                  <span className="text-muted-foreground text-xs">
                    {mode.description}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One control for who picks the model and how hard it thinks: "Auto" lets
 * the app choose per request; a named model is used for every step.
 */
export function ModelPicker({
  disabled,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (value: ExecutionPolicy) => void;
  value: ExecutionPolicy;
}) {
  const liveKeys = useModelKeys();
  // A saved choice that has since dropped out of the list stays selectable.
  const modelKeys =
    value.modelKey && !liveKeys.includes(value.modelKey)
      ? [...liveKeys, value.modelKey]
      : liveKeys;
  const manual = value.control === "manual" && Boolean(value.modelKey);
  const efforts: ReasoningEffort[] =
    manual && value.modelKey
      ? modelInfo(value.modelKey).reasoningEfforts
      : ["automatic"];

  const level = manual
    ? value.reasoningEffort === "automatic"
      ? null
      : REASONING_LABEL[value.reasoningEffort]
    : value.complexity === "auto"
      ? null
      : COMPLEXITY.find((option) => option.value === value.complexity)?.label;

  const options: { label: string; value: string }[] = manual
    ? efforts.map((effort) => ({
        label: effort === "automatic" ? "Auto" : REASONING_LABEL[effort],
        value: effort,
      }))
    : [...COMPLEXITY];
  const selected = manual ? value.reasoningEffort : value.complexity;

  return (
    <DropdownMenu>
      <Trigger disabled={disabled} title="Model and thinking">
        <Cpu className="size-3.5" />
        <span className="max-w-36 truncate text-foreground">
          {manual && value.modelKey
            ? modelInfo(value.modelKey).displayName
            : "Auto"}
        </span>
        {level && <span>{level}</span>}
      </Trigger>
      <DropdownMenuContent align="end" className="w-72" side="top">
        <DropdownMenuRadioGroup
          onValueChange={(next) => {
            if (next === "auto") {
              onChange({ ...value, control: "agent" });
              return;
            }
            const modelKey = next as ModelKey;
            onChange({
              ...value,
              control: "manual",
              modelKey,
              reasoningEffort: modelInfo(modelKey).reasoningEfforts.includes(
                value.reasoningEffort
              )
                ? value.reasoningEffort
                : "automatic",
            });
          }}
          value={manual ? (value.modelKey ?? "") : "auto"}
        >
          <DropdownMenuRadioItem className="items-start py-1.5" value="auto">
            <span className="flex flex-col">
              <span>Auto</span>
              <span className="text-muted-foreground text-xs">
                The app picks the model for each request
              </span>
            </span>
          </DropdownMenuRadioItem>
          <div className="max-h-72 overflow-y-auto">
            {PROVIDERS.map((provider) => {
              const keys = modelKeys.filter(
                (key) => modelInfo(key).provider === provider
              );
              if (keys.length === 0) return null;
              return (
                <DropdownMenuGroup key={provider}>
                  <DropdownMenuLabel>{provider}</DropdownMenuLabel>
                  {keys.map((key) => (
                    <DropdownMenuRadioItem
                      closeOnClick={false}
                      key={key}
                      value={key}
                    >
                      {modelInfo(key).displayName}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuGroup>
              );
            })}
          </div>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <div className="space-y-1.5 px-1.5 py-1.5">
          <div className="flex items-baseline justify-between text-muted-foreground text-xs">
            <span>{manual ? "Thinking" : "Effort"}</span>
            <span>{manual ? "Faster ↔ deeper" : "Faster ↔ smarter"}</span>
          </div>
          <div className="flex w-full border">
            {options.map((option) => (
              <button
                aria-pressed={selected === option.value}
                className={`h-7 flex-1 text-xs transition-colors disabled:opacity-50 ${
                  selected === option.value
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
                disabled={manual && efforts.length === 1}
                key={option.value}
                onClick={() =>
                  onChange(
                    manual
                      ? {
                          ...value,
                          reasoningEffort: option.value as ReasoningEffort,
                        }
                      : {
                          ...value,
                          complexity:
                            option.value as ExecutionPolicy["complexity"],
                        }
                  )
                }
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            {manual
              ? efforts.length === 1
                ? "This model decides how much to think on its own."
                : "Used for the plan and the schema."
              : "Quick steps always use a fast model."}
          </p>
        </div>
        {!manual && (
          <div className="space-y-1.5 px-1.5 pb-1.5">
            <div className="flex items-baseline justify-between text-muted-foreground text-xs">
              <span>Thinking</span>
              <span>Faster ↔ deeper</span>
            </div>
            <div className="flex w-full border">
              {AGENT_THINKING.map((effort) => (
                <button
                  aria-pressed={value.reasoningEffort === effort}
                  className={`h-7 flex-1 text-xs transition-colors ${
                    value.reasoningEffort === effort
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60"
                  }`}
                  key={effort}
                  onClick={() =>
                    onChange({ ...value, reasoningEffort: effort })
                  }
                  type="button"
                >
                  {effort === "automatic" ? "Auto" : REASONING_SHORT[effort]}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              Used when the chosen model supports it.
            </p>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
