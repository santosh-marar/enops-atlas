import {
  Bot,
  Hammer,
  ListChecks,
  Route,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  MODEL_INFO,
  MODELS,
  type ModelKey,
  type ReasoningEffort,
} from "@/lib/ai/model-registory";

const MODES = [
  {
    description: "Plan first, then ask before writing the schema.",
    icon: Route,
    label: "Auto",
    value: "auto",
  },
  {
    description: "Only produce a plan. Nothing is written.",
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

const effortLabel = (effort: ReasoningEffort) =>
  effort === "automatic"
    ? "Auto thinking"
    : `${effort[0]?.toUpperCase()}${effort.slice(1)} thinking`;

const MODEL_KEYS = Object.keys(MODELS) as ModelKey[];
const PROVIDERS = [
  ...new Set(MODEL_KEYS.map((key) => MODEL_INFO[key].provider)),
].sort();

/** Mode, who picks the model, and which model and how much thinking. */
export function ExecutionControls({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (value: ExecutionPolicy) => void;
  value: ExecutionPolicy;
}) {
  const patch = (next: Partial<ExecutionPolicy>) =>
    onChange({ ...value, ...next });
  const efforts = value.modelKey
    ? MODEL_INFO[value.modelKey].reasoningEfforts
    : (["automatic"] as ReasoningEffort[]);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="sr-only">Execution setup</span>
      {MODES.map((option) => {
        const Icon = option.icon;
        return (
          <Button
            aria-label={`${option.label}: ${option.description}`}
            aria-pressed={value.mode === option.value}
            className="h-8 px-2"
            disabled={disabled}
            key={option.value}
            onClick={() => patch({ mode: option.value })}
            title={option.description}
            type="button"
            variant={value.mode === option.value ? "secondary" : "ghost"}
          >
            <Icon className="mr-1 size-3.5" />
            {option.label}
          </Button>
        );
      })}
      <span className="h-5 w-px bg-border" />
      <Button
        aria-label="Agent control"
        aria-pressed={value.control === "agent"}
        className="h-8 px-2"
        disabled={disabled}
        onClick={() => patch({ control: "agent" })}
        title="The app picks the model for each task"
        type="button"
        variant={value.control === "agent" ? "secondary" : "ghost"}
      >
        <Bot className="mr-1 size-3.5" /> Agent
      </Button>
      <Button
        aria-label="Manual control"
        aria-pressed={value.control === "manual"}
        className="h-8 px-2"
        disabled={disabled}
        onClick={() =>
          patch({
            control: "manual",
            modelKey: value.modelKey ?? "claude-sonnet-4-6",
            reasoningEffort: "automatic",
          })
        }
        title="Choose the model yourself"
        type="button"
        variant={value.control === "manual" ? "secondary" : "ghost"}
      >
        <SlidersHorizontal className="mr-1 size-3.5" /> Manual
      </Button>

      {value.control === "agent" ? (
        <Select
          disabled={disabled}
          items={COMPLEXITY}
          onValueChange={(next) =>
            next && patch({ complexity: next as ExecutionPolicy["complexity"] })
          }
          value={value.complexity}
        >
          <SelectTrigger
            aria-label="Task size"
            className="h-8 w-[150px] text-xs"
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
      ) : (
        <>
          <Select
            disabled={disabled}
            items={MODEL_KEYS.map((key) => ({
              label: MODEL_INFO[key].displayName,
              value: key,
            }))}
            onValueChange={(next) => {
              if (!next) return;
              const modelKey = next as ModelKey;
              patch({
                modelKey,
                reasoningEffort: MODEL_INFO[modelKey].reasoningEfforts.includes(
                  value.reasoningEffort
                )
                  ? value.reasoningEffort
                  : "automatic",
              });
            }}
            value={value.modelKey}
          >
            <SelectTrigger aria-label="Model" className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Choose model" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {PROVIDERS.map((provider) => (
                <SelectGroup key={provider}>
                  <SelectLabel>{provider}</SelectLabel>
                  {MODEL_KEYS.filter(
                    (key) => MODEL_INFO[key].provider === provider
                  ).map((key) => (
                    <SelectItem key={key} value={key}>
                      {MODEL_INFO[key].displayName}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <Select
            disabled={disabled || efforts.length === 1}
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
              className="h-8 w-[132px] text-xs"
              title={
                efforts.length === 1
                  ? "This model decides how much to think on its own"
                  : undefined
              }
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
        </>
      )}
    </div>
  );
}
