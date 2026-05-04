import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";

function CommandBlock({
  className,
  label,
  code,
  copied,
  onCopy,
}: {
  className?:string,
  label: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    // <div className="flex flex-col gap-1 ">
        <div className={cn("flex flex-col gap-1", className)}>

      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="relative flex flex-col items-end rounded-md bg-muted border p-2">
        <button
          onClick={onCopy}
          // className="absolute top-2 right-2 p-1 hover:bg-background/50 rounded transition-colors"
          className="hover:bg-background/50 rounded transition-colors"

          title="Copy to clipboard"
        >
          {copied ? (
            <Check className="h-3 w-3 text-primary" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
        <code className="font-mono text-xs whitespace-pre-wrap break-all pr-6 text-foreground mt-2">
          {code}
        </code>
      </div>
    </div>
  );
}

export default CommandBlock;