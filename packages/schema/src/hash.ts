import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const encoder = new TextEncoder();

/** Synchronous SHA-256 available in browsers, workers, Bun and Node. */
export function sha256Hex(value: string): string {
  return bytesToHex(sha256(encoder.encode(value)));
}
