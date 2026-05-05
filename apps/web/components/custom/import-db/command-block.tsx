import { cn } from "@/lib/utils";
import { CopyButton } from "../copy-button";

function CommandBlock({
  className,
  label,
  code,
}: {
  className?: string;
  label: string;
  code: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <p className="font-medium text-muted-foreground text-xs">{label}</p>

      <div className="relative rounded-md border bg-muted p-2">
        {/* Copy Button */}
        <CopyButton
          className="absolute top-2 right-2"
          iconClassName="size-3"
          value={code}
        />

        {/* Code */}
        <code className="block whitespace-pre-wrap break-all pr-8 font-mono text-foreground text-xs">
          {code}
        </code>
      </div>
    </div>
  );
}

export default CommandBlock;
