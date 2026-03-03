import assert from "assert";
import { buildScoreBar, buildSummaryBody } from "./format";
import type { ReviewResponse } from "../types";

function pass(name: string): void {
  console.log(`  ✅  ${name}`);
}

function fail(name: string, err: unknown): void {
  console.error(`  ❌  ${name}`, err);
  process.exitCode = 1;
}

function suite(name: string): void {
  console.log(`\n▶ ${name}`);
}

suite("buildScoreBar");

try {
  assert.strictEqual(buildScoreBar(7), "███████░░░");
  pass("renders 7/10 bar");
} catch (e) {
  fail("renders 7/10 bar", e);
}

try {
  assert.strictEqual(buildScoreBar(-3), "░░░░░░░░░░");
  assert.strictEqual(buildScoreBar(14), "██████████");
  pass("clamps values to 0..10");
} catch (e) {
  fail("clamps values to 0..10", e);
}

suite("buildSummaryBody");

const review: ReviewResponse = {
  summary: "Nice refactor with one follow-up",
  score: 8,
  comments: [
    { file: "src/a.ts", line: 10, severity: "HIGH", message: "Fix null handling" },
    { file: "src/b.ts", line: 3, severity: "MED", message: "Consider memoization" },
    { file: "src/c.ts", line: 9, severity: "LOW", message: "Nit: rename variable" },
  ],
};

try {
  const body = buildSummaryBody(review, buildScoreBar(review.score), 2);
  assert.ok(body.includes("## 🤖 SentinelAI Code Review"));
  assert.ok(body.includes("### Score: 8/10"));
  assert.ok(body.includes("| 🔴 HIGH  | 1 |"));
  assert.ok(body.includes("| 🟡 MED   | 1  |"));
  assert.ok(body.includes("| 🔵 LOW   | 1  |"));
  assert.ok(body.includes("| **Total posted** | 2 |"));
  pass("includes score and severity counts");
} catch (e) {
  fail("includes score and severity counts", e);
}

try {
  const footer = "_Custom footer_";
  const body = buildSummaryBody(review, buildScoreBar(review.score), 3, footer);
  assert.ok(body.endsWith(footer));
  pass("uses custom footer when provided");
} catch (e) {
  fail("uses custom footer when provided", e);
}

console.log("\n─────────────────────────────────");
if (process.exitCode === 1) {
  console.error("Some tests failed.");
} else {
  console.log("All tests passed ✓");
}
