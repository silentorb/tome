import { describe, expect, test } from "bun:test";
import {
  aggregateResults,
  evaluateGate,
  formatGateSummary,
  isNonessentialName,
  NONESSENTIAL_PREFIX,
  parseJunitXml,
  passRate,
} from "../src/index";

describe("tiers naming", () => {
  test("detects nonessential prefix", () => {
    expect(isNonessentialName(`${NONESSENTIAL_PREFIX}Escape closes`)).toBe(true);
    expect(isNonessentialName("[nonessential] Escape closes")).toBe(true);
    expect(isNonessentialName("Escape closes")).toBe(false);
    expect(isNonessentialName(null)).toBe(false);
  });
});

describe("parseJunitXml", () => {
  test("classifies critical and nonessential cases from Bun-style XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="4" failures="1" skipped="1" time="0.1">
  <testsuite name="ToolPanel" file="ToolPanel.test.tsx" tests="4" failures="1" skipped="1" time="0.05">
    <testcase name="close button clears the session" classname="ToolPanel" time="0.01" file="ToolPanel.test.tsx" assertions="1"/>
    <testcase name="[nonessential] Escape closes the panel" classname="ToolPanel" time="0.01" file="ToolPanel.test.tsx" assertions="0">
      <failure type="AssertionError">removeChild</failure>
    </testcase>
    <testcase name="ArrowLeft widens" classname="ToolPanel" time="0.01" assertions="1">
      <skipped/>
    </testcase>
    <testcase name="hidden until open" classname="[nonessential] Soft suite" time="0.01" assertions="0">
      <failure type="Error"/>
    </testcase>
  </testsuite>
</testsuites>`;

    const cases = parseJunitXml(xml);
    expect(cases).toHaveLength(4);

    expect(cases[0]).toMatchObject({
      name: "close button clears the session",
      tier: "critical",
      status: "passed",
    });
    expect(cases[1]).toMatchObject({
      name: "[nonessential] Escape closes the panel",
      tier: "nonessential",
      status: "failed",
    });
    expect(cases[2]).toMatchObject({
      status: "skipped",
      tier: "critical",
    });
    expect(cases[3]).toMatchObject({
      classname: "[nonessential] Soft suite",
      tier: "nonessential",
      status: "failed",
    });
  });
});

describe("passRate and evaluateGate", () => {
  test("vacuous nonessential rate is 1", () => {
    expect(passRate({ passed: 0, failed: 0, skipped: 3 })).toBe(1);
  });

  test("critical failure blocks even when nonessential is perfect", () => {
    const cases = parseJunitXml(`
      <testsuites>
        <testsuite name="A">
          <testcase name="ok" classname="A"/>
          <testcase name="boom" classname="A"><failure/></testcase>
          <testcase name="[nonessential] soft" classname="A"/>
        </testsuite>
      </testsuites>`);
    const gate = evaluateGate(cases, 0.9);
    expect(gate.decision).toEqual({ ok: false, reason: "critical_failure" });
    expect(gate.criticalFailures).toHaveLength(1);
  });

  test("single nonessential failure still passes at 90% when enough nonessential cases pass", () => {
    const names = Array.from({ length: 9 }, (_, i) => `soft-${i}`);
    const xmlParts = [
      `<testcase name="critical-ok" classname="C"/>`,
      ...names.map((n) => `<testcase name="[nonessential] ${n}" classname="C"/>`),
      `<testcase name="[nonessential] flaky" classname="C"><failure/></testcase>`,
    ];
    const cases = parseJunitXml(
      `<testsuites><testsuite name="C">${xmlParts.join("")}</testsuite></testsuites>`,
    );
    const gate = evaluateGate(cases, 0.9);
    expect(gate.decision.ok).toBe(true);
    expect(gate.nonessentialPassRate).toBe(0.9);
  });

  test("sparse suite allows one nonessential failure below the rate denominator", () => {
    const cases = parseJunitXml(`
      <testsuites>
        <testsuite name="A">
          <testcase name="ok" classname="A"/>
          <testcase name="[nonessential] only" classname="A"><failure/></testcase>
        </testsuite>
      </testsuites>`);
    const gate = evaluateGate(cases, 0.9);
    expect(gate.decision.ok).toBe(true);
    expect(gate.nonessentialPassRate).toBe(0);
  });

  test("two nonessential failures in a sparse suite still fail the threshold", () => {
    const cases = parseJunitXml(`
      <testsuites>
        <testsuite name="A">
          <testcase name="ok" classname="A"/>
          <testcase name="[nonessential] a" classname="A"><failure/></testcase>
          <testcase name="[nonessential] b" classname="A"><failure/></testcase>
        </testsuite>
      </testsuites>`);
    const gate = evaluateGate(cases, 0.9);
    expect(gate.decision).toEqual({ ok: false, reason: "nonessential_threshold" });
  });

  test("aggregateResults buckets tiers", () => {
    const cases = parseJunitXml(`
      <testsuites>
        <testsuite name="A">
          <testcase name="c1" classname="A"/>
          <testcase name="[nonessential] n1" classname="A"><failure/></testcase>
          <testcase name="c2" classname="A"><skipped/></testcase>
        </testsuite>
      </testsuites>`);
    const agg = aggregateResults(cases);
    expect(agg.critical).toEqual({ passed: 1, failed: 0, skipped: 1 });
    expect(agg.nonessential).toEqual({ passed: 0, failed: 1, skipped: 0 });
  });

  test("formatGateSummary mentions PASS or FAIL", () => {
    const pass = evaluateGate(
      parseJunitXml(`<testsuites><testsuite name="A"><testcase name="ok" classname="A"/></testsuite></testsuites>`),
      0.9,
    );
    expect(formatGateSummary(pass)).toContain("result: PASS");

    const fail = evaluateGate(
      parseJunitXml(
        `<testsuites><testsuite name="A"><testcase name="x" classname="A"><failure/></testcase></testsuite></testsuites>`,
      ),
      0.9,
    );
    expect(formatGateSummary(fail)).toContain("result: FAIL");
  });
});
