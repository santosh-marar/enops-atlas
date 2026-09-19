import type { Edge, Node } from "@xyflow/react";

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

/** Schema-only JSON — tables/fields, no canvas positions. */
export function exportSchemaJSON(nodes: Node[], fileName = "schema") {
  const schema = nodes.map((node) => ({
    fields: node.data.fields ?? [],
    table: node.data.label,
  }));
  downloadTextFile(JSON.stringify(schema, null, 2), `${fileName}.json`);
}

/** Raw DBML text, straight from the store. */
export function exportDBML(dbml: string, fileName = "schema") {
  downloadTextFile(dbml, `${fileName}.dbml`, "text/plain");
}
