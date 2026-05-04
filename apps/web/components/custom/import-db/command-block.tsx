import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function CommandBlock({
  className,
  label,
  code,
  copied,
  onCopy,
}: {
  className?: string;
  label: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    // <div className="flex flex-col gap-1 ">
    <div className={cn("flex flex-col gap-1", className)}>
      <p className="font-medium text-muted-foreground text-xs">{label}</p>
      <div className="relative flex flex-col items-end rounded-md border bg-muted p-2">
        <button
          // className="absolute top-2 right-2 p-1 hover:bg-background/50 rounded transition-colors"
          className="rounded transition-colors hover:bg-background/50"
          onClick={onCopy}
          title="Copy to clipboard"
        >
          {copied ? (
            <Check className="h-3 w-3 text-primary" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
        <code className="mt-2 whitespace-pre-wrap break-all pr-6 font-mono text-foreground text-xs">
          {code}
        </code>
      </div>
    </div>
  );
}

export default CommandBlock;
