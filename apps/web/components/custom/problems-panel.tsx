"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CircleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { type ValidationError, validateDBML } from "@/validation/dbml-editor";

const DEBOUNCE_MS = 300;

interface ProblemsPanelProps {
  dbml: string;
  onSelect: (problem: ValidationError) => void;
}

export default function ProblemsPanel({ dbml, onSelect }: ProblemsPanelProps) {
  const [problems, setProblems] = useState<ValidationError[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let stale = false;
    const timer = setTimeout(async () => {
      const result = await validateDBML(dbml);
      if (!stale) setProblems(result.errors);
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [dbml]);

  const errors = problems.filter((p) => p.severity === "error").length;
  const warnings = problems.length - errors;

  return (
    <div className="border-t bg-background text-xs">
      <button
        className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-muted"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="font-medium">Problems</span>
        <span className="flex items-center gap-1 text-destructive">
          <CircleAlert className="size-3" /> {errors}
        </span>
        <span className="flex items-center gap-1 text-yellow-600">
          <AlertTriangle className="size-3" /> {warnings}
        </span>
        <span className="ml-auto">
          {open ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronUp className="size-3" />
          )}
        </span>
      </button>
      {open && (
        <ul className="max-h-40 overflow-y-auto">
          {problems.length === 0 && (
            <li className="px-3 py-2 text-muted-foreground">No problems.</li>
          )}
          {problems.map((problem, index) => (
            <li key={`${problem.line}-${problem.code ?? ""}-${index}`}>
              <button
                className="flex w-full items-start gap-2 px-3 py-1 text-left hover:bg-muted"
                onClick={() => onSelect(problem)}
                type="button"
              >
                {problem.severity === "error" ? (
                  <CircleAlert className="mt-0.5 size-3 shrink-0 text-destructive" />
                ) : (
                  <AlertTriangle
                    className={cn("mt-0.5 size-3 shrink-0 text-yellow-600")}
                  />
                )}
                <span className="flex-1">{problem.message}</span>
                <span className="text-muted-foreground">
                  line {problem.line}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
