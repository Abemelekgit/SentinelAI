/**
 * src/utils/format.ts — Shared markdown/text formatting helpers.
 *
 * Extracted from pr-handler.ts so the same utilities can be reused
 * by the dashboard and any future reporter modules.
 */

import type { ReviewResponse } from "../types.js";

/**
 * Build a Unicode block progress bar for a score in the range 1–10.
 *
 * @example
 * buildScoreBar(7) // "███████░░░"
 */
export function buildScoreBar(score: number): string {
  const filled = Math.min(10, Math.max(0, Math.round(score)));
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Render the Markdown summary block that is posted as the top-level
 * PR review comment.
 *
 * @param review          - The validated AI review result.
 * @param scoreBar        - Pre-rendered bar from `buildScoreBar()`.
 * @param postedComments  - Number of inline comments that were actually posted.
 * @param footer          - Optional footer line appended to the summary.
 */
export function buildSummaryBody(
  review: ReviewResponse,
  scoreBar: string,
  postedComments: number,
  footer?: string
): string {
  const highCount = review.comments.filter((c) => c.severity === "HIGH").length;
  const medCount = review.comments.filter((c) => c.severity === "MED").length;
  const lowCount = review.comments.filter((c) => c.severity === "LOW").length;

  const lines = [
    "## 🤖 SentinelAI Code Review",
    "",
    `> ${review.summary}`,
    "",
    `### Score: ${review.score}/10  \`${scoreBar}\``,
    "",
    "| Severity | Count |",
    "|----------|-------|",
    `| 🔴 HIGH  | ${highCount} |`,
    `| 🟡 MED   | ${medCount}  |`,
    `| 🔵 LOW   | ${lowCount}  |`,
    `| **Total posted** | ${postedComments} |`,
    "",
    footer ?? "_Powered by SentinelAI — your autonomous senior engineer._",
  ];

  return lines.join("\n");
}
