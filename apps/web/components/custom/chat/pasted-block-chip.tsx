import { FileText, X } from "lucide-react";

export function PastedBlockChip({
  lineCount,
  name,
  onRemove,
}: {
  lineCount: number;
  /** An attached file's name; pasted text has none. */
  name?: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs">
      <FileText className="h-3 w-3 text-muted-foreground" />
      {name ? (
        <>
          <span className="max-w-40 truncate font-mono">{name}</span>
          <span className="text-muted-foreground">{lineCount} lines</span>
        </>
      ) : (
        <>Pasted {lineCount} lines</>
      )}
      <button
        aria-label={name ? `Remove ${name}` : "Remove pasted content"}
        className="ml-0.5 rounded-sm p-0.5 hover:bg-destructive/10 hover:text-destructive"
        onClick={onRemove}
        type="button"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
