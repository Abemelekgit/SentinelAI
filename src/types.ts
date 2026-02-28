/**
 * src/types.ts — Shared TypeScript types for SentinelAI.
 *
 * Centralising these avoids circular imports between services and handlers.
 */

export type Severity = "HIGH" | "MED" | "LOW";

export const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  HIGH: 3,
  MED: 2,
  LOW: 1,
};

export const SEVERITY_EMOJI: Readonly<Record<Severity, string>> = {
  HIGH: "🔴",
  MED: "🟡",
  LOW: "🔵",
};

export interface ReviewComment {
  file: string;
  line: number;
  message: string;
  severity: Severity;
}

export interface ReviewResponse {
  summary: string;
  /** Code-quality score 1–10 */
  score: number;
  comments: ReviewComment[];
}
