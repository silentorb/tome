import { describe, test } from "bun:test";

/** Prefix applied to nonessential test (and describe) names for JUnit classification. */
export const NONESSENTIAL_PREFIX = "[nonessential] ";

type TestFn = Parameters<typeof test>[1];
type TestOptions = Parameters<typeof test>[2];

/** Explicit critical case. Plain `test(...)` is also critical by default. */
export function criticalTest(name: string, fn: TestFn, options?: TestOptions) {
  return test(name, fn, options);
}

/**
 * Lower-weight case: always runs; failures count toward the nonessential pass-rate
 * threshold instead of hard-failing the suite alone.
 */
export function nonessentialTest(name: string, fn: TestFn, options?: TestOptions) {
  return test(`${NONESSENTIAL_PREFIX}${name}`, fn, options);
}

/** Mark an entire describe block as nonessential (suite name carries the prefix). */
export function describeNonessential(name: string, fn: () => void) {
  return describe(`${NONESSENTIAL_PREFIX}${name}`, fn);
}

export function isNonessentialName(name: string | undefined | null): boolean {
  if (!name) return false;
  return name.startsWith(NONESSENTIAL_PREFIX) || name.startsWith("[nonessential]");
}
