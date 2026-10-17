/**
 * Stable Account node id for a request after authentication (minimal LCD shape).
 * Once user corpora exist this is an Account node ULID; prototype sessions may use any non-empty string.
 */
export type Principal = {
  accountNodeId: string;
};

/** Thin session record — enough to create, delete, and resolve a principal. */
export type Session = {
  id: string;
  accountNodeId: string;
};
