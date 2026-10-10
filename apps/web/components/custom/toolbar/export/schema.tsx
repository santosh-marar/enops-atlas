import { exportCanonicalDbml } from "@enops/atlas-schema";
import type { Edge, Node } from "@xyflow/react";
import { analyzeDbml } from "@/lib/atlas";

function downloadTextFile(
  content: string,
  fileName: string,
  mimeType = "application/json"
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Full project file — nodes, edges, viewport. Re-importable. */
export function exportDiagramJSON(
  nodes: Node[],
  edges: Edge[],
  fileName = "diagram"
) {
  const payload = {
    edges,
    exportedAt: new Date().toISOString(),
    nodes,
    version: 1,
  };
  downloadTextFile(JSON.stringify(payload, null, 2), `${fileName}.json`);
}

/** The canonical schema as JSON: tables, columns, keys, enums. No canvas positions. */
export function canonicalSchemaJson(dbml: string): string {
  return JSON.stringify(analyzeDbml(dbml).canonical, null, 2);
}

/** The schema rewritten in the canonical DBML layout. Comments are not kept. */
export function canonicalDbmlText(
  dbml: string
): { ok: true; dbml: string } | { message: string; ok: false } {
  const result = exportCanonicalDbml(analyzeDbml(dbml).canonical);
  if (result.ok) return result;
  return {
    message: result.diagnostics.map((issue) => issue.message).join("; "),
    ok: false,
  };
}

export function exportSchemaJSON(dbml: string, fileName = "schema") {
  downloadTextFile(canonicalSchemaJson(dbml), `${fileName}.json`);
}

export function exportCanonicalDBML(dbml: string, fileName = "schema") {
  const result = canonicalDbmlText(dbml);
  if (!result.ok) throw new Error(result.message);
  downloadTextFile(result.dbml, `${fileName}.dbml`, "text/plain");
}

/** Raw DBML text, straight from the store. */
export function exportDBML(dbml: string, fileName = "schema") {
  downloadTextFile(dbml, `${fileName}.dbml`, "text/plain");
}
