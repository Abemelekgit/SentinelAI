/**
 * src/services/diff.test.ts — Unit tests for DiffService.
 *
 * Run with: npx ts-node --esm src/services/diff.test.ts
 * (or plug into your test runner of choice — Jest, Vitest, etc.)
 */

import assert from "assert";
import { DiffService } from "./diff";

const svc = new DiffService(10_000);

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Test data ────────────────────────────────────────────────────────────────

const SIMPLE_DIFF = `diff --git a/src/index.ts b/src/index.ts
index abc..def 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import express from "express";
+import helmet from "helmet";
 const app = express();
 app.listen(3000);
`;

const LOCK_DIFF = `diff --git a/package-lock.json b/package-lock.json
index aaa..bbb 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,3 +1,3 @@
-  "version": "1.0.0"
+  "version": "1.0.1"
`;

const BINARY_DIFF = `diff --git a/image.png b/image.png
index aaa..bbb 100644
Binary files a/image.png and b/image.png differ
`;

const MULTI_FILE_DIFF = `diff --git a/src/a.ts b/src/a.ts
index aaa..bbb 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 const x = 1;
+const y = 2;
diff --git a/src/b.ts b/src/b.ts
index ccc..ddd 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -5,3 +5,4 @@
 function foo() {}
+function bar() {}
`;

// ─── Suite: parse() ──────────────────────────────────────────────────────────

suite("DiffService.parse()");

try {
  const result = svc.parse(SIMPLE_DIFF);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].path, "src/index.ts");
  pass("parses a single-file diff");
} catch (e) { fail("parses a single-file diff", e); }

try {
  const result = svc.parse("");
  assert.deepStrictEqual(result, []);
  pass("returns [] for empty string");
} catch (e) { fail("returns [] for empty string", e); }

try {
  const result = svc.parse("   \n  ");
  assert.deepStrictEqual(result, []);
  pass("returns [] for whitespace-only string");
} catch (e) { fail("returns [] for whitespace-only string", e); }

try {
  const result = svc.parse(LOCK_DIFF);
  assert.deepStrictEqual(result, []);
  pass("filters out lock-file diffs");
} catch (e) { fail("filters out lock-file diffs", e); }

try {
  const result = svc.parse(BINARY_DIFF);
  assert.deepStrictEqual(result, []);
  pass("filters out binary diffs");
} catch (e) { fail("filters out binary diffs", e); }

try {
  const result = svc.parse(MULTI_FILE_DIFF);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].path, "src/a.ts");
  assert.strictEqual(result[1].path, "src/b.ts");
  pass("splits multi-file diff correctly");
} catch (e) { fail("splits multi-file diff correctly", e); }

// ─── Suite: lineMap ───────────────────────────────────────────────────────────

suite("DiffService — lineMap");

try {
  const result = svc.parse(SIMPLE_DIFF);
  const lm = result[0].lineMap;
  assert.ok(lm.size > 0, "lineMap should not be empty");
  // The '+' line (import helmet) should map to line 2 in the new file
  const values = Array.from(lm.values());
  assert.ok(values.includes(2), "import helmet should map to new-file line 2");
  pass("lineMap maps + lines to new-file line numbers");
} catch (e) { fail("lineMap maps + lines to new-file line numbers", e); }

// ─── Suite: serialize() ──────────────────────────────────────────────────────

suite("DiffService.serialize()");

try {
  const diffs = svc.parse(MULTI_FILE_DIFF);
  const out = svc.serialize(diffs);
  assert.ok(out.includes("=== FILE: src/a.ts ==="));
  assert.ok(out.includes("=== FILE: src/b.ts ==="));
  pass("serialize() includes file headers");
} catch (e) { fail("serialize() includes file headers", e); }

// ─── Suite: truncation ───────────────────────────────────────────────────────

suite("DiffService — truncation");

try {
  const tinySvc = new DiffService(50);
  const result = tinySvc.parse(SIMPLE_DIFF);
  assert.ok(result.length > 0);
  assert.ok(result[0].patch.length <= 120, "patch should be truncated");
  pass("truncates patches exceeding maxTotalChars");
} catch (e) { fail("truncates patches exceeding maxTotalChars", e); }

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log("\n─────────────────────────────────");
if (process.exitCode === 1) {
  console.error("Some tests failed.");
} else {
  console.log("All tests passed ✓");
}
