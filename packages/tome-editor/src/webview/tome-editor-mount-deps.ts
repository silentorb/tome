/**
 * Effect deps that remount Milkdown — callbacks are read via refs and must not appear here.
 *
 * Kept in a tiny module (no React/Milkdown imports) so contract tests are not poisoned by
 * `mock.module` stubs of `TomeEditor` that leak across Bun test files.
 */
export const TOME_EDITOR_MOUNT_DEPS = ["api", "nodeId", "initialDocumentKey"] as const;
