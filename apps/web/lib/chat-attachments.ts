/**
 * Files Atlas chat can read as context: schemas (DBML, SQL, Prisma, Drizzle)
 * and text that describes one (JSON, YAML, CSV, Markdown). Images and other
 * binary files are refused; the schema models only read text.
 */
const LANGUAGE: Record<string, string> = {
  csv: "csv",
  dbml: "dbml",
  json: "json",
  md: "markdown",
  prisma: "prisma",
  sql: "sql",
  ts: "ts",
  txt: "text",
  yaml: "yaml",
  yml: "yaml",
};

export const ATTACHMENT_ACCEPT = Object.keys(LANGUAGE)
  .map((extension) => `.${extension}`)
  .join(",");
export const MAX_ATTACHMENT_BYTES = 200_000;
export const MAX_ATTACHMENTS = 5;

export interface Attachment {
  lineCount: number;
  name: string;
  /** What the model receives: the file, fenced and labelled with its name. */
  text: string;
}

const extensionOf = (name: string) =>
  name.includes(".") ? (name.split(".").pop()?.toLowerCase() ?? "") : "";

/** Why a file can't be attached, or null when it can. */
export function attachmentProblem(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (file.type.startsWith("image/")) {
    return `${file.name}: images aren't supported. Attach a schema or text file.`;
  }
  if (!LANGUAGE[extensionOf(file.name)]) {
    return `${file.name}: use DBML, SQL, Prisma, Drizzle (.ts), JSON, YAML, CSV, Markdown or text.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name}: larger than ${MAX_ATTACHMENT_BYTES / 1000} KB.`;
  }
  return null;
}

/** Wraps file contents so the model knows where the file starts and ends. */
export function toAttachment(name: string, contents: string): Attachment {
  const body = contents.replace(/\s+$/, "");
  return {
    lineCount: body.split("\n").length,
    name,
    text: `File: ${name}\n\`\`\`${LANGUAGE[extensionOf(name)] ?? "text"}\n${body}\n\`\`\``,
  };
}

/** Reads the files that pass the checks; the rest come back as problems. */
export async function readAttachments(
  files: File[],
  alreadyAttached: number
): Promise<{ attachments: Attachment[]; problems: string[] }> {
  const problems: string[] = [];
  const accepted: File[] = [];
  for (const file of files) {
    if (alreadyAttached + accepted.length >= MAX_ATTACHMENTS) {
      problems.push(`Attach up to ${MAX_ATTACHMENTS} files at a time.`);
      break;
    }
    const problem = attachmentProblem(file);
    if (problem) problems.push(problem);
    else accepted.push(file);
  }

  const contents = await Promise.all(accepted.map((file) => file.text()));
  const attachments: Attachment[] = [];
  accepted.forEach((file, index) => {
    const text = contents[index] ?? "";
    // A text extension on binary content (a renamed image, a dump file).
    if (text.includes("\u0000")) {
      problems.push(`${file.name}: not a text file.`);
    } else if (text.trim()) {
      attachments.push(toAttachment(file.name, text));
    } else {
      problems.push(`${file.name}: the file is empty.`);
    }
  });
  return { attachments, problems };
}
