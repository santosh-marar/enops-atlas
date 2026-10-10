"use client";

import { exportCanonicalDbml } from "@enops/atlas-schema";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { analyzeDbml } from "@/lib/atlas";
import { useSchemaStore } from "@/store/use-schema-store";

export type FormatResult =
  | { dbml: string; ok: true }
  | { message: string; ok: false };

/** Rewrites DBML in the canonical layout. Comments are not kept. */
export function formatDbml(dbml: string): FormatResult {
  if (!dbml.trim()) return { message: "Nothing to format", ok: false };
  try {
    const { canonical } = analyzeDbml(dbml);
    const result = exportCanonicalDbml(canonical);
    if (result.ok) return { dbml: result.dbml, ok: true };
    return {
      message: result.diagnostics.map((issue) => issue.message).join("; "),
      ok: false,
    };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : "Invalid DBML",
      ok: false,
    };
  }
}

export function FormatButton() {
  const dbml = useSchemaStore((state) => state.dbml);
  const updateFromDBML = useSchemaStore((state) => state.updateFromDBML);

  const handleFormat = async () => {
    const result = formatDbml(dbml);
    if (!result.ok) {
      toast.error(`Can't format: ${result.message}`);
      return;
    }
    if (result.dbml === dbml) {
      toast.info("Already formatted");
      return;
    }
    if (!window.confirm("Formatting removes comments. Continue?")) return;
    await updateFromDBML(result.dbml, true);
  };

  return (
    <Button onClick={handleFormat} size="sm" variant="ghost">
      Format
    </Button>
  );
}
