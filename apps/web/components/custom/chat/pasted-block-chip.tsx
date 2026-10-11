import { FileText, X } from "lucide-react";

export function PastedBlockChip({
  lineCount,
  onRemove,
}: {
  lineCount: number;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs">
      <FileText className="h-3 w-3 text-muted-foreground" />
      Pasted {lineCount} lines
      <button
        aria-label="Remove pasted content"
        className="ml-0.5 rounded-sm p-0.5 hover:bg-destructive/10 hover:text-destructive"
        onClick={onRemove}
        type="button"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
