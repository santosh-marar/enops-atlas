import { Sparkles } from "lucide-react";

const CAPABILITIES = [
  "Foreign key relationships",
  "Optimized indexes",
  "Data constraints",
  "Scalability patterns",
];

export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="rounded-lg border border-border bg-card p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h3 className="mb-2 font-semibold text-base">AI Schema Assistant</h3>
        <p className="mb-4 max-w-sm text-muted-foreground text-sm">
          Describe your application and I will generate a production-ready
          database schema.
        </p>
        <div className="space-y-1.5 text-left text-muted-foreground text-xs">
          {CAPABILITIES.map((item) => (
            <p className="flex items-center gap-2" key={item}>
              <span className="text-green-600 dark:text-green-400">✓</span>
              {item}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
