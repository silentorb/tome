import { isNodeId } from "../node-id";

/** Crockford Base32 alphabet (ULID); excludes I, L, O, U. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const DECODE = new Map<string, number>();
for (let i = 0; i < CROCKFORD.length; i++) {
  DECODE.set(CROCKFORD[i]!, i);
}

/**
 * Decode a canonical uppercase ULID to 16 bytes (128 bits).
 * Throws if `id` is not a valid node/association ULID.
 */
export function ulidToBytes(id: string): Uint8Array {
  if (!isNodeId(id)) {
    throw new Error(`Invalid ULID: ${id}`);
  }
  let value = 0n;
  for (let i = 0; i < 26; i++) {
    const digit = DECODE.get(id[i]!);
    if (digit === undefined) {
      throw new Error(`Invalid ULID character in: ${id}`);
    }
    value = (value << 5n) | BigInt(digit);
  }
  const out = new Uint8Array(16);
  for (let i = 15; i >= 0; i--) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}

/** Concatenate decoded ULID bytes for `a`, `b`, and `type` (48 bytes). */
export function relationshipKeyBytes(a: string, b: string, type: string): Uint8Array {
  const out = new Uint8Array(48);
  out.set(ulidToBytes(a), 0);
  out.set(ulidToBytes(b), 16);
  out.set(ulidToBytes(type), 32);
  return out;
}
