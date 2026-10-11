const EXAMPLES = [
  "Design a schema for a SaaS app with teams and billing",
  "Add created_at and updated_at to every table",
  "Add a notification system",
  "Explain how my tables relate",
];

/** Where an empty chat starts: one line on what it does, and a few things to try. */
export function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col justify-center gap-5 px-1">
      <div>
        <h3 className="font-medium text-base">What should we build?</h3>
        <p className="mt-1 max-w-sm text-muted-foreground text-sm">
          Describe your app or a change. I plan it with you first, then write
          the schema, and nothing is applied until you say so.
        </p>
      </div>
      <ul className="space-y-1">
        {EXAMPLES.map((prompt) => (
          <li key={prompt}>
            <button
              className="w-full border-border border-l-2 py-1 pl-3 text-left text-muted-foreground text-sm transition-colors hover:border-primary hover:text-foreground"
              onClick={() => onPick(prompt)}
              type="button"
            >
              {prompt}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
