/**
 * pr-handler.ts — Probot webhook handler for pull_request events.
 *
 * On every PR open / synchronise / reopen:
 *   1. Fetch the diff from GitHub.
 *   2. Parse & clean it via DiffService.
 *   3. Get AI review via AIService.
 *   4. Load optional per-repo config from .sentinel.yaml.
 *   5. Post inline review comments + a summary review body.
 */

import type { Probot, Context } from "probot";
import yaml from "js-yaml";
import { DiffService, type FileDiff } from "../services/diff.js";
import { AIService } from "../services/ai.js";
import type { ReviewComment, ReviewResponse } from "../types.js";
import { SEVERITY_RANK, SEVERITY_EMOJI } from "../types.js";
import { config } from "../config.js";
import { reviewLog } from "./dashboard.js";
import {
  validateSentinelConfig,
  type SentinelConfig,
} from "../utils/sentinel-config.js";

// Cache parsed .sentinel.yaml per commit SHA to avoid redundant API calls
// on the same commit (e.g. re-runs within the same webhook delivery).
const sentinelConfigCache = new Map<string, SentinelConfig>();

// ─── Handler registration ─────────────────────────────────────────────────────

export function registerPRHandler(app: Probot): void {
  app.on(
    ["pull_request.opened", "pull_request.synchronize", "pull_request.reopened"],
    async (context) => {
      const log = context.log.child({ handler: "pr-handler" });

      const { owner, repo } = context.repo();
      const pullNumber = context.payload.pull_request.number;

      log.info({ owner, repo, pullNumber }, "PR event received — starting review");

      try {
        // ── 1. Fetch the raw diff ───────────────────────────────────────────
        const rawDiff = await fetchDiff(context);
        if (!rawDiff) {
          log.info("PR diff is empty — nothing to review");
          return;
        }

        // ── 2. Load optional per-repo config from .sentinel.yaml ───────────
        const sentinelCfg = await loadSentinelConfig(context);

        // ── 3. Parse & clean the diff ──────────────────────────────────────
        const diffSvc = new DiffService(config.maxDiffChars);
        const fileDiffs = diffSvc.parse(rawDiff);

        if (fileDiffs.length === 0) {
          log.info("No reviewable file changes found after filtering");
          return;
        }

        const serialised = diffSvc.serialize(fileDiffs);

        // ── 4. Get AI review ───────────────────────────────────────────────
        const aiSvc = new AIService();
        const review = await aiSvc.review(serialised);

        log.info({ score: review.score, comments: review.comments.length }, "AI review complete");

        // ── 5. Filter comments by minSeverity ──────────────────────────────
        const minRank = SEVERITY_RANK[sentinelCfg.minSeverity ?? "LOW"] ?? 1;
        const filtered = review.comments.filter(
          (c) => (SEVERITY_RANK[c.severity] ?? 0) >= minRank
        );

        // ── 6. Map comments to GitHub PR positions ─────────────────────────
        const fileMap = new Map(fileDiffs.map((d) => [d.path, d]));
        const githubComments = buildGithubComments(filtered, fileMap);

        // ── 7. Apply a score label to the PR ──────────────────────────────
        await applyScoreLabel(context, pullNumber, review.score);

        // ── 8. Post the review to GitHub ───────────────────────────────────
        await postReview(context, review, githubComments, sentinelCfg, pullNumber);

        // ── 9. Record in the live dashboard log ──────────────────────────
        reviewLog.push({
          ts: new Date().toLocaleString(),
          repo: `${owner}/${repo}`,
          pr: pullNumber,
          score: review.score,
          highCount: review.comments.filter((c) => c.severity === "HIGH").length,
          medCount: review.comments.filter((c) => c.severity === "MED").length,
          lowCount: review.comments.filter((c) => c.severity === "LOW").length,
        });

        log.info({ pullNumber }, "SentinelAI review posted successfully");
      } catch (err) {
        log.error({ err }, "SentinelAI encountered an error during review");

        // Post a degraded comment so the PR author knows the bot ran
        await context.octokit.issues.createComment(
          context.issue({
            body:
              "⚠️ **SentinelAI** encountered an error and could not complete the review.\n\n" +
              `\`\`\`\n${String(err)}\n\`\`\``,
          })
        );
      }
    }
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fetch the raw unified diff for the PR. */
async function fetchDiff(context: Context<"pull_request">): Promise<string | null> {
  const response = await context.octokit.pulls.get({
    ...context.repo(),
    pull_number: context.payload.pull_request.number,
    mediaType: { format: "diff" },
  });

  // The diff is returned as a string when mediaType.format is "diff"
  const diff = response.data as unknown as string;
  return diff || null;
}

/** Load .sentinel.yaml from the repo root via the GitHub Contents API. */
async function loadSentinelConfig(
  context: Context<"pull_request">
): Promise<SentinelConfig> {
  const sha = context.payload.pull_request.head.sha;

  if (sentinelConfigCache.has(sha)) {
    return sentinelConfigCache.get(sha) as SentinelConfig;
  }

  let result: SentinelConfig = {};
  try {
    const resp = await context.octokit.repos.getContent({
      ...context.repo(),
      path: ".sentinel.yaml",
      ref: sha,
    });

    if ("content" in resp.data && typeof resp.data.content === "string") {
      const decoded = Buffer.from(resp.data.content, "base64").toString("utf-8");
      const parsed = yaml.load(decoded);
      const validation = validateSentinelConfig(parsed);
      if (validation.valid) {
        result = validation.config;
      } else {
        context.log.warn(
          `[SentinelAI] .sentinel.yaml validation failed: ${validation.errors.join("; ")} — using defaults`
        );
      }
    }
  } catch {
    // File doesn't exist or is unreadable — use defaults
  }

  sentinelConfigCache.set(sha, result);
  // Evict old entries to prevent unbounded growth (keep last 50)
  if (sentinelConfigCache.size > 50) {
    const firstKey = sentinelConfigCache.keys().next().value;
    if (firstKey !== undefined) sentinelConfigCache.delete(firstKey);
  }

  return result;
}

/** Apply a SentinelAI quality label to the PR based on the review score. */
async function applyScoreLabel(
  context: Context<"pull_request">,
  pullNumber: number,
  score: number
): Promise<void> {
  const label =
    score >= 9 ? "sentinel: excellent ✅" :
    score >= 7 ? "sentinel: good 🟡" :
    score >= 5 ? "sentinel: needs work 🟠" :
                 "sentinel: critical 🔴";

  const color =
    score >= 9 ? "0e8a16" :
    score >= 7 ? "e4e669" :
    score >= 5 ? "f9a825" :
                 "b60205";

  try {
    // Ensure the label exists in the repo (create if absent)
    await context.octokit.issues.createLabel({
      ...context.repo(),
      name: label,
      color,
      description: `SentinelAI code quality score: ${score}/10`,
    });
  } catch {
    // Label already exists — that's fine
  }

  await context.octokit.issues.addLabels({
    ...context.repo(),
    issue_number: pullNumber,
    labels: [label],
  });
}

/** Convert AI comments to the shape expected by Octokit's createReview. */
function buildGithubComments(
  comments: ReviewComment[],
  fileMap: Map<string, FileDiff>
): Array<{ path: string; line: number; body: string }> {
  const result: Array<{ path: string; line: number; body: string }> = [];
  // Deduplicate by path+line — prevents double-posting the same issue
  // when the AI returns the same location with slightly different wording.
  const seen = new Set<string>();

  for (const raw of comments) {
    // Normalise paths: strip leading "./" or "/" that some LLMs emit
    const normalisedPath = raw.file.replace(/^(\.\/|\/)+/, "");
    const fileDiff = fileMap.get(normalisedPath) ?? fileMap.get(raw.file);
    if (!fileDiff) continue; // AI hallucinated a file path — skip

    // Verify the line is within what we actually reviewed
    const validLines = Array.from(fileDiff.lineMap.values());
    let line = raw.line;
    if (validLines.length > 0 && !validLines.includes(line)) {
      // Clamp to nearest valid reviewed line
      line = validLines.reduce((prev, curr) =>
        Math.abs(curr - line) < Math.abs(prev - line) ? curr : prev
      );
    }
    const c = { ...raw, line };

    const dedupeKey = `${fileDiff.path}:${c.line}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    result.push({
      path: fileDiff.path, // always use the canonical path from the diff
      line: c.line,
      body: `${SEVERITY_EMOJI[c.severity] ?? "⚪"} **[${c.severity}]** ${c.message}`,
    });
  }

  return result;
}

/** Post the full review (inline comments + summary body) via Octokit. */
async function postReview(
  context: Context<"pull_request">,
  review: ReviewResponse,
  comments: Array<{ path: string; line: number; body: string }>,
  cfg: SentinelConfig,
  pullNumber: number
): Promise<void> {
  const scoreBar = buildScoreBar(review.score);
  const summaryBody = buildSummaryBody(review, scoreBar, comments.length);

  const event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES" =
    review.score >= 8 && comments.length === 0
      ? "APPROVE"
      : review.comments.some((c) => c.severity === "HIGH")
      ? "REQUEST_CHANGES"
      : "COMMENT";

  await context.octokit.pulls.createReview({
    ...context.repo(),
    pull_number: pullNumber,
    commit_id: context.payload.pull_request.head.sha,
    event,
    body: cfg.postSummary !== false ? summaryBody : "",
    comments: comments.map((c) => ({
      path: c.path,
      line: c.line,
      body: c.body,
    })),
  });
}

/** Unicode progress bar for the score (1–10). */
function buildScoreBar(score: number): string {
  const filled = Math.round(score);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/** Markdown summary body posted as the top-level review comment. */
function buildSummaryBody(
  review: ReviewResponse,
  scoreBar: string,
  postedComments: number
): string {
  const highCount = review.comments.filter((c) => c.severity === "HIGH").length;
  const medCount = review.comments.filter((c) => c.severity === "MED").length;
  const lowCount = review.comments.filter((c) => c.severity === "LOW").length;

  return [
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
    "_Powered by SentinelAI — your autonomous senior engineer._",
  ].join("\n");
}
