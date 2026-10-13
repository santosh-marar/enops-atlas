"use client";

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface EffortOption<T extends string> {
  hint?: string;
  label: string;
  value: T;
}

/**
 * A stepped "Faster ↔ Smarter" slider for use inside a dropdown menu. Each
 * step is a menu radio item, so arrow keys and screen readers work as usual.
 */
export function EffortTrack<T extends string>({
  label,
  low = "Faster",
  onChange,
  options,
  value,
}: {
  label: string;
  low?: string;
  onChange: (value: T) => void;
  options: EffortOption<T>[];
  value: T;
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const current = options[index];

  return (
    <div className="px-1.5 pt-1 pb-1.5">
      <div className="flex items-baseline gap-1.5 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{current?.label}</span>
      </div>
      <div className="mt-3 mb-1.5 flex justify-between text-muted-foreground text-xs">
        <span>{low}</span>
        <span>Smarter</span>
      </div>
      <DropdownMenuRadioGroup
        aria-label={label}
        className="flex h-6 bg-muted"
        onValueChange={(next) => onChange(next as T)}
        value={value}
      >
        {options.map((option, position) => (
          <DropdownMenuRadioItem
            aria-label={option.label}
            className={cn(
              "group h-full flex-1 justify-center rounded-none p-0 focus:bg-transparent [&_[data-slot=dropdown-menu-radio-item-indicator]]:hidden",
              position < index && "bg-primary/35",
              position === index &&
                "bg-gradient-to-r from-50% from-primary/35 to-50% to-transparent"
            )}
            closeOnClick={false}
            key={option.value}
            value={option.value}
          >
            {position === index ? (
              <span className="h-[18px] w-7 bg-foreground ring-primary group-data-highlighted:ring-2" />
            ) : (
              <span className="h-[3px] w-[3px] bg-muted-foreground group-data-highlighted:h-2 group-data-highlighted:w-2" />
            )}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      {current?.hint && (
        <p className="mt-2 text-muted-foreground text-xs">{current.hint}</p>
      )}
    </div>
  );
}
