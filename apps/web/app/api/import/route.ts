import {
  drizzleToDbml,
  prismaToDbml,
} from "@enops/atlas-schema-intelligence/node";

// Server only: reads Prisma and Drizzle schema text and answers with DBML.
// It parses the text, never runs it, never writes to disk.
export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_000_000;
const MAX_FILES = 50;
const MAX_PATH_LENGTH = 200;

interface ImportFile {
  content: string;
  path: string;
}

const fail = (status: number, error: string) =>
  Response.json({ error }, { status });

/** Reads the body, stopping as soon as it is over the limit. */
async function readLimitedText(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return null;
  if (!request.body) return "";

  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    // returning early cancels the stream
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const isImportFile = (value: unknown): value is ImportFile => {
  const file = value as Partial<ImportFile> | null;
  return (
    typeof file?.path === "string" &&
    file.path.length > 0 &&
    file.path.length <= MAX_PATH_LENGTH &&
    typeof file.content === "string"
  );
};

export async function POST(request: Request) {
  const text = await readLimitedText(request);
  if (text === null) {
    return fail(413, "Request is too large. The limit is 1 MB.");
  }

  let body: { files?: unknown; format?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, "Request body must be JSON.");
  }

  if (body.format !== "prisma" && body.format !== "drizzle") {
    return fail(400, 'format must be "prisma" or "drizzle".');
  }
  if (
    !(Array.isArray(body.files) && body.files.length > 0) ||
    body.files.length > MAX_FILES ||
    !body.files.every(isImportFile)
  ) {
    return fail(
      400,
      `files must be 1 to ${MAX_FILES} items of { path, content }.`
    );
  }

  const files = body.files as ImportFile[];
  try {
    const result =
      body.format === "prisma"
        ? prismaToDbml(files.map((file) => [file.path, file.content]))
        : drizzleToDbml(files);
    return Response.json({ dbml: result.dbml, warnings: result.warnings });
  } catch (error) {
    return fail(
      422,
      error instanceof Error ? error.message : "Could not read the schema."
    );
  }
}
