import { ulid } from "ulid";

/**
 * Node id regex source: a canonical uppercase ULID (26 chars of Crockford
 * base32, which excludes the letters I, L, O, U). Exposed as a string so it can
 * be embedded inside larger patterns (wiki links, URIs, route paths).
 */
export const NODE_ID_RE_SRC = "[0-9A-HJKMNP-TV-Z]{26}";

/** Matches a bare node id. */
export const NODE_ID_PATTERN = new RegExp(`^${NODE_ID_RE_SRC}$`);

/** Matches a node markdown basename (`<id>.md`) under a shard dir in `content/data/`. */
export const NODE_FILE_PATTERN = new RegExp(`^${NODE_ID_RE_SRC}\\.md$`);

/** True when `id` is a canonical node id (uppercase ULID). */
export function isNodeId(id: string): boolean {
  return NODE_ID_PATTERN.test(id);
}

/** Mint a new node id (ULID). */
export function generateNodeId(): string {
  return ulid();
}
