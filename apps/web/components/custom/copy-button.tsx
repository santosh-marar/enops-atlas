"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { CopyButtonProps } from "@/types/copy-button";
import { Button } from "../ui/button";

export function CopyButton({
  value,
  className,
  iconClassName,
  copiedDuration = 1500,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), copiedDuration);
    } catch {
      console.error("Copy failed");
    }
  };

  return (
    <Button
      className={cn("rounded p-1 transition-colors", className)}
      onClick={handleCopy}
      size={"icon-xs"}
      title={copied ? "Copied!" : "Copy to clipboard"}
      variant={"ghost"}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}
