import {
  ChevronDown,
  Hammer,
  ListChecks,
  Route,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
  type ReasoningEffort,
  subscribeCatalog,
  visibleModelKeys,
} from "@/lib/ai/model-registory";
import {
  pickerLabel,
  pinModel,
  setThinking,
  shortEffort,
  switchControl,
  thinkingOn,
  thinkingOptions,
} from "@/lib/ai/picker-policy";
import { cn } from "@/lib/utils";
import { type EffortOption, EffortTrack } from "./effort-track";

const COMPLEXITY: EffortOption<ExecutionPolicy["complexity"]>[] = [
  {
    hint: "Recommended. Small changes stay quick, big ones get a stronger model.",
    label: "Auto",
    value: "auto",
  },
  { hint: "Quickest model at every step.", label: "Fast", value: "fast" },
  {
    hint: "Strong model at moderate cost.",
    label: "Balanced",
    value: "balanced",
  },
  { hint: "Most capable model. Costs the most.", label: "Deep", value: "deep" },
];

const HIDE_INDICATOR =
  "[&_[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden [&_[data-slot=dropdown-menu-radio-item-indicator]]:hidden";

const NUMBER =
  "-mr-6 ml-auto grid h-4 min-w-4 place-items-center border px-0.5 font-mono text-[10px] text-muted-foreground";

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
  children: ReactNode;
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

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = MODES[Number(event.key) - 1];
    if (!target) return;
    event.preventDefault();
    onChange({ ...value, mode: target.value });
  }

  return (
    <DropdownMenu>
      <Trigger disabled={disabled} title="Mode (Alt+M to switch)">
        <Icon className="size-3.5 text-foreground" />
        <span className="font-medium text-foreground">{current.label}</span>
      </Trigger>
      <DropdownMenuContent
        align="start"
        className="w-80"
        onKeyDown={handleKeyDown}
        side="top"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(mode) =>
              onChange({ ...value, mode: mode as ExecutionPolicy["mode"] })
            }
            value={value.mode}
          >
            {MODES.map((mode, index) => (
              <DropdownMenuRadioItem
                className="group/mode items-start py-1.5"
                key={mode.value}
                value={mode.value}
              >
                <mode.icon className="mt-0.5 text-muted-foreground" />
                <span className="flex flex-col">
                  <span>{mode.label}</span>
                  <span className="text-muted-foreground text-xs">
                    {mode.description}
                  </span>
                </span>
                <span
                  className={cn(
                    NUMBER,
                    "mt-0.5 group-data-checked/mode:invisible"
                  )}
                >
                  {index + 1}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <div className="flex justify-between px-1.5 py-1 text-muted-foreground text-xs">
          <span>Switch mode</span>
          <kbd className="font-mono">Alt M</kbd>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Who picks the model and how hard it works. Agent lets the app pick a model
 * per request by effort; Manual pins one. Extended thinking applies to both,
 * where the model supports it.
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
  const groups = PROVIDERS.map((provider) => ({
    keys: modelKeys.filter((key) => modelInfo(key).provider === provider),
    provider,
  })).filter((group) => group.keys.length > 0);
  const ordered = groups.flatMap((group) => group.keys);
  const thinking = thinkingOptions(value);
  const on = thinkingOn(value);
  const { level, model } = pickerLabel(value);

  function pick(modelKey: ModelKey) {
    onChange(pinModel(value, modelKey));
  }

  function setControl(next: string) {
    const policy = switchControl(
      value,
      ordered,
      next as ExecutionPolicy["control"]
    );
    if (policy) onChange(policy);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!(manual && /^[1-9]$/.test(event.key))) return;
    const target = ordered[Number(event.key) - 1];
    if (!target) return;
    event.preventDefault();
    pick(target);
  }

  return (
    <DropdownMenu>
      <Trigger disabled={disabled} title="Model and thinking">
        <span className="max-w-36 truncate font-medium text-foreground">
          {model}
        </span>
        {level && <span>{level}</span>}
      </Trigger>
      <DropdownMenuContent
        align="end"
        className="w-72"
        onKeyDown={handleKeyDown}
        side="top"
      >
        <DropdownMenuRadioGroup
          aria-label="Who picks the model"
          className="grid grid-cols-2 gap-0.5 bg-muted p-0.5"
          onValueChange={(next) => setControl(String(next))}
          value={manual ? "manual" : "agent"}
        >
          {(
            [
              { icon: Sparkles, label: "Agent", value: "agent" },
              { icon: SlidersHorizontal, label: "Manual", value: "manual" },
            ] as const
          ).map((option) => (
            <DropdownMenuRadioItem
              className={cn(
                "justify-center rounded-none px-2 py-1 text-muted-foreground data-checked:bg-popover data-checked:font-medium data-checked:text-foreground",
                HIDE_INDICATOR
              )}
              closeOnClick={false}
              key={option.value}
              value={option.value}
            >
              <option.icon />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {manual ? (
          <DropdownMenuRadioGroup
            aria-label="Model"
            className="mt-1 max-h-64 overflow-y-auto"
            onValueChange={(next) => pick(next as ModelKey)}
            value={value.modelKey ?? ""}
          >
            {groups.map((group) => (
              <DropdownMenuGroup key={group.provider}>
                <DropdownMenuLabel>{group.provider}</DropdownMenuLabel>
                {group.keys.map((key) => {
                  const index = ordered.indexOf(key);
                  return (
                    <DropdownMenuRadioItem
                      className="group/model"
                      closeOnClick={false}
                      key={key}
                      value={key}
                    >
                      <span className="truncate">
                        {modelInfo(key).displayName}
                      </span>
                      {index < 9 && (
                        <span
                          className={cn(
                            NUMBER,
                            "group-data-checked/model:invisible"
                          )}
                        >
                          {index + 1}
                        </span>
                      )}
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuRadioGroup>
        ) : (
          <>
            <div className="flex items-start gap-2 px-1.5 pt-2 pb-1.5">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="flex flex-col text-sm">
                <span>The app picks the model</span>
                <span className="text-muted-foreground text-xs">
                  Switch to Manual to choose one
                </span>
              </span>
            </div>
            <DropdownMenuSeparator />
            <EffortTrack
              label="Effort"
              low="Cheaper"
              onChange={(complexity) => onChange({ ...value, complexity })}
              options={COMPLEXITY}
              value={value.complexity}
            />
          </>
        )}

        <DropdownMenuSeparator />
        {thinking.levels.length > 0 ? (
          <>
            <DropdownMenuCheckboxItem
              checked={on}
              className={cn("group/think py-1.5 pr-1.5", HIDE_INDICATOR)}
              closeOnClick={false}
              disabled={!thinking.canSwitchOff}
              onCheckedChange={(on) => onChange(setThinking(value, on))}
            >
              <span className="flex flex-col">
                <span>Extended thinking</span>
                <span className="text-muted-foreground text-xs">
                  {thinking.canSwitchOff
                    ? manual
                      ? "Thinks before it answers"
                      : "Off where the chosen model allows it"
                    : "This model can't switch it off"}
                </span>
              </span>
              <span
                aria-hidden
                className="relative ml-auto h-4 w-7 shrink-0 bg-muted ring-1 ring-input after:absolute after:top-0.5 after:left-0.5 after:size-3 after:bg-muted-foreground after:transition-[left] group-data-checked/think:bg-primary group-data-checked/think:ring-primary group-data-checked/think:after:left-3.5 group-data-checked/think:after:bg-primary-foreground motion-reduce:after:transition-none"
              />
            </DropdownMenuCheckboxItem>
            {on && (
              <EffortTrack
                label="Thinking"
                onChange={(reasoningEffort) =>
                  onChange({ ...value, reasoningEffort })
                }
                options={thinking.levels.map(
                  (effort): EffortOption<ReasoningEffort> =>
                    effort === "automatic"
                      ? manual
                        ? {
                            hint: "The model's own default.",
                            label: "Default",
                            value: effort,
                          }
                        : {
                            hint: "Recommended. The model decides how much to think.",
                            label: "Auto",
                            value: effort,
                          }
                      : { label: shortEffort(effort), value: effort }
                )}
                value={value.reasoningEffort}
              />
            )}
          </>
        ) : (
          <p className="px-1.5 py-1.5 text-muted-foreground text-xs">
            This model decides how much to think on its own.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
