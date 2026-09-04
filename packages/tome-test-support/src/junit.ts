import { isNonessentialName } from "./tiers";

export type TestTier = "essential" | "nonessential";

export type TestCaseResult = {
  name: string;
  classname: string;
  file?: string;
  tier: TestTier;
  status: "passed" | "failed" | "skipped";
};

export type TierCounts = {
  passed: number;
  failed: number;
  skipped: number;
};

export type AggregatedResults = {
  essential: TierCounts;
  nonessential: TierCounts;
  cases: TestCaseResult[];
};

function emptyCounts(): TierCounts {
  return { passed: 0, failed: 0, skipped: 0 };
}

function attr(attrs: string, key: string): string {
  const match = attrs.match(new RegExp(`\\b${key}="([^"]*)"`));
  return match?.[1] ?? "";
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function classifyTier(name: string, classname: string): TestTier {
  if (isNonessentialName(name) || isNonessentialName(classname)) {
    return "nonessential";
  }
  return "essential";
}

function caseStatus(inner: string): TestCaseResult["status"] {
  if (/<skipped[\s/>]/i.test(inner) || /<\/skipped>/i.test(inner)) return "skipped";
  if (/<failure[\s/>]/i.test(inner) || /<\/failure>/i.test(inner)) return "failed";
  if (/<error[\s/>]/i.test(inner) || /<\/error>/i.test(inner)) return "failed";
  return "passed";
}

/** Parse Bun (or compatible) JUnit XML into flat testcase results. */
export function parseJunitXml(xml: string, fileHint?: string): TestCaseResult[] {
  const results: TestCaseResult[] = [];
  // Self-closing must not cross `>` (otherwise `<failure/>` inside a body is mistaken for the case close).
  const pattern =
    /<testcase\b([^>]*?)\s*\/>|<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const selfClosing = match[1] != null;
    const attrs = (selfClosing ? match[1] : match[2]) ?? "";
    const inner = selfClosing ? "" : (match[3] ?? "");
    const name = decodeXml(attr(attrs, "name"));
    const classname = decodeXml(attr(attrs, "classname"));
    const file = decodeXml(attr(attrs, "file")) || fileHint;
    results.push({
      name,
      classname,
      file: file || undefined,
      tier: classifyTier(name, classname),
      status: caseStatus(inner),
    });
  }
  return results;
}

export function aggregateResults(cases: TestCaseResult[]): AggregatedResults {
  const essential = emptyCounts();
  const nonessential = emptyCounts();
  for (const c of cases) {
    const bucket = c.tier === "nonessential" ? nonessential : essential;
    if (c.status === "passed") bucket.passed += 1;
    else if (c.status === "failed") bucket.failed += 1;
    else bucket.skipped += 1;
  }
  return { essential, nonessential, cases };
}

/** Pass rate among executed (non-skipped) cases; 1 when none executed. */
export function passRate(counts: TierCounts): number {
  const executed = counts.passed + counts.failed;
  if (executed === 0) return 1;
  return counts.passed / executed;
}
