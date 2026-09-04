import {
  aggregateResults,
  passRate,
  type AggregatedResults,
  type TestCaseResult,
  type TierCounts,
} from "./junit";

export type GateDecision =
  | { ok: true; reason: "passed" }
  | { ok: false; reason: "essential_failure" | "nonessential_threshold" };

export type GateEvaluation = {
  decision: GateDecision;
  essential: TierCounts;
  nonessential: TierCounts;
  nonessentialPassRate: number;
  minNonessentialPassRate: number;
  essentialFailures: TestCaseResult[];
  nonessentialFailures: TestCaseResult[];
};

/**
 * Nonessential gate: pass rate ≥ minRate, or a single failure while the suite is
 * still too small to express that rate (e.g. 1 fail among 1–9 cases at 90%).
 */
export function nonessentialGateOk(counts: TierCounts, minRate: number): boolean {
  const executed = counts.passed + counts.failed;
  if (executed === 0 || counts.failed === 0) return true;
  if (passRate(counts) + Number.EPSILON >= minRate) return true;
  if (minRate >= 1) return false;
  const minDenomForRate = Math.ceil(1 / (1 - minRate));
  return executed < minDenomForRate && counts.failed === 1;
}

export function evaluateGate(
  cases: TestCaseResult[],
  minNonessentialPassRate: number,
): GateEvaluation {
  const aggregated: AggregatedResults = aggregateResults(cases);
  const essentialFailures = cases.filter(
    (c) => c.tier === "essential" && c.status === "failed",
  );
  const nonessentialFailures = cases.filter(
    (c) => c.tier === "nonessential" && c.status === "failed",
  );
  const nonessentialPassRate = passRate(aggregated.nonessential);

  if (essentialFailures.length > 0) {
    return {
      decision: { ok: false, reason: "essential_failure" },
      essential: aggregated.essential,
      nonessential: aggregated.nonessential,
      nonessentialPassRate,
      minNonessentialPassRate,
      essentialFailures,
      nonessentialFailures,
    };
  }

  if (!nonessentialGateOk(aggregated.nonessential, minNonessentialPassRate)) {
    return {
      decision: { ok: false, reason: "nonessential_threshold" },
      essential: aggregated.essential,
      nonessential: aggregated.nonessential,
      nonessentialPassRate,
      minNonessentialPassRate,
      essentialFailures,
      nonessentialFailures,
    };
  }

  return {
    decision: { ok: true, reason: "passed" },
    essential: aggregated.essential,
    nonessential: aggregated.nonessential,
    nonessentialPassRate,
    minNonessentialPassRate,
    essentialFailures,
    nonessentialFailures,
  };
}

export function formatGateSummary(evaluation: GateEvaluation): string {
  const { essential, nonessential, nonessentialPassRate, minNonessentialPassRate } =
    evaluation;
  const ratePct = (nonessentialPassRate * 100).toFixed(1);
  const minPct = (minNonessentialPassRate * 100).toFixed(1);
  const lines = [
    "Weighted test gate summary",
    `  essential:    ${essential.passed} passed, ${essential.failed} failed, ${essential.skipped} skipped`,
    `  nonessential: ${nonessential.passed} passed, ${nonessential.failed} failed, ${nonessential.skipped} skipped (${ratePct}% pass rate; min ${minPct}%)`,
  ];

  if (evaluation.essentialFailures.length > 0) {
    lines.push("  essential failures:");
    for (const f of evaluation.essentialFailures) {
      lines.push(`    - ${f.classname}: ${f.name}${f.file ? ` (${f.file})` : ""}`);
    }
  }
  if (evaluation.nonessentialFailures.length > 0) {
    lines.push("  nonessential failures:");
    for (const f of evaluation.nonessentialFailures) {
      lines.push(`    - ${f.classname}: ${f.name}${f.file ? ` (${f.file})` : ""}`);
    }
  }

  if (!evaluation.decision.ok) {
    if (evaluation.decision.reason === "essential_failure") {
      lines.push("  result: FAIL (essential test failure)");
    } else {
      lines.push("  result: FAIL (nonessential pass rate below threshold)");
    }
  } else {
    lines.push("  result: PASS");
  }

  return lines.join("\n");
}
