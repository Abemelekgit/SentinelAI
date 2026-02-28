/**
 * AIService — Sends the cleaned diff to the configured LLM and returns a
 * structured review response.
 *
 * Supports: Gemini 1.5 Pro / 2.0 Flash (via @google/generative-ai)
 *           GPT-4o / GPT-4-turbo    (via openai)
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { config } from "../config.js";
import type { Severity, ReviewComment, ReviewResponse } from "../types.js";

// ─── Re-export for consumers who import from this module ─────────────────────
export type { Severity, ReviewComment, ReviewResponse };

// ─── System / Brain Prompt ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Senior Full-Stack Security Engineer conducting a thorough code review.

Your task:
  1. Analyse the provided git diff carefully.
  2. Identify ONLY real, concrete issues:
     - Logic errors / off-by-one bugs
     - Security vulnerabilities (SQL injection, XSS, CSRF, hardcoded secrets/keys, insecure dependencies, path traversal, etc.)
     - Performance problems (N+1 queries, unbounded loops, memory leaks)
     - Unhandled errors / missing input validation
     - Deprecated or dangerous API usage
  3. DO NOT invent issues. If the code is clean, return an empty comments array.

Output Rules:
  - Respond with ONLY a valid JSON object — no markdown fences, no explanation.
  - The JSON must strictly follow this schema:

{
  "summary": "<High-level overview: what this PR does and your overall assessment>",
  "score": <integer 1-10, where 10 = production-ready perfection>,
  "comments": [
    {
      "file": "<relative file path, e.g. src/auth/login.ts>",
      "line": <line number in the NEW version of the file>,
      "message": "<Concise description of the issue and how to fix it>",
      "severity": "<HIGH | MED | LOW>"
    }
  ]
}

Severity guidelines:
  HIGH  — Exploitable security flaw or crash-causing bug. Must fix before merge.
  MED   — Code smell or risk that should be addressed soon.
  LOW   — Minor improvement, style note, or optimisation suggestion.`;

// ─── Retry helper ────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((res) => setTimeout(res, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AIService {
  private readonly gemini?: GoogleGenerativeAI;
  private readonly openai?: OpenAI;

  /**
   * Initialises the AI client based on the configured provider.
   * Reads credentials from the validated `config` singleton — never from
   * `process.env` directly.
   */
  constructor() {
    if (config.aiProvider === "gemini" && config.geminiApiKey) {
      this.gemini = new GoogleGenerativeAI(config.geminiApiKey);
    } else if (config.aiProvider === "openai" && config.openaiApiKey) {
      this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    }
  }

  /**
   * Perform a full AI code review on the serialised diff.
   *
   * The diff is wrapped in a user-prompt and sent to the configured LLM.
   * The raw JSON response is strictly validated before being returned.
   * Automatically retries up to 3 times on transient failures.
   *
   * @param serialisedDiff - Output of `DiffService.serialize()`.
   * @returns A validated `ReviewResponse` object.
   * @throws If the LLM returns non-JSON or a schema-invalid payload after
   *         all retries are exhausted.
   */
  async review(serialisedDiff: string): Promise<ReviewResponse> {
    const userPrompt = `Here is the git diff to review:\n\n${serialisedDiff}`;

    const raw = await withRetry(() =>
      config.aiProvider === "gemini"
        ? this.callGemini(userPrompt)
        : this.callOpenAI(userPrompt)
    );

    return this.parseResponse(raw);
  }

  // ── Gemini ─────────────────────────────────────────────────────────────────

  /**
   * Send a prompt to the Gemini model and return the raw text response.
   * Uses `responseMimeType: "application/json"` to encourage well-formed JSON.
   *
   * @param userPrompt - The assembled user message including the diff payload.
   */
  private async callGemini(userPrompt: string): Promise<string> {
    if (!this.gemini) throw new Error("Gemini client not initialised");

    const model = this.gemini.getGenerativeModel({
      model: config.aiModel,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent(userPrompt);
    const text = result.response.text();
    if (!text) throw new Error("Gemini returned an empty response");
    return text;
  }

  // ── OpenAI ─────────────────────────────────────────────────────────────────

  /**
   * Send a prompt to the OpenAI model and return the raw text response.
   * Uses `response_format: { type: "json_object" }` to enforce JSON output.
   *
   * @param userPrompt - The assembled user message including the diff payload.
   */
  private async callOpenAI(userPrompt: string): Promise<string> {
    if (!this.openai) throw new Error("OpenAI client not initialised");

    const completion = await this.openai.chat.completions.create({
      model: config.aiModel,
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) throw new Error("OpenAI returned an empty response");
    return text;
  }

  // ── Parsing & validation ───────────────────────────────────────────────────

  /**
   * Strip accidental markdown fences and parse the raw string as JSON.
   * Delegates structural validation to `validate()`.
   *
   * @param raw - The raw text returned by the LLM.
   */
  private parseResponse(raw: string): ReviewResponse {
    let parsed: unknown;

    try {
      // Strip accidental markdown fences if the model ignores the instruction
      const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`AI returned non-JSON payload:\n${raw.slice(0, 300)}`);
    }

    return this.validate(parsed);
  }

  /**
   * Validate that the parsed JSON object conforms to the `ReviewResponse`
   * schema. Throws a descriptive error for any missing or mistyped field,
   * preventing bad AI output from propagating to the GitHub API.
   *
   * @param data - The result of `JSON.parse()` — typed as `unknown`.
   */
  private validate(data: unknown): ReviewResponse {
    if (!data || typeof data !== "object") {
      throw new Error("AI response is not an object");
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj["summary"] !== "string") {
      throw new Error('AI response missing "summary" string');
    }
    if (typeof obj["score"] !== "number" || obj["score"] < 1 || obj["score"] > 10) {
      throw new Error('AI response "score" must be a number between 1 and 10');
    }
    if (!Array.isArray(obj["comments"])) {
      throw new Error('AI response missing "comments" array');
    }

    const comments: ReviewComment[] = (obj["comments"] as unknown[]).map(
      (c, i) => {
        if (!c || typeof c !== "object") {
          throw new Error(`Comment[${i}] is not an object`);
        }
        const comment = c as Record<string, unknown>;
        if (typeof comment["file"] !== "string") throw new Error(`Comment[${i}] missing "file"`);
        if (typeof comment["line"] !== "number") throw new Error(`Comment[${i}] missing "line"`);
        if (typeof comment["message"] !== "string") throw new Error(`Comment[${i}] missing "message"`);
        if (!["HIGH", "MED", "LOW"].includes(comment["severity"] as string)) {
          throw new Error(`Comment[${i}] severity must be HIGH | MED | LOW`);
        }
        return {
          file: comment["file"] as string,
          line: comment["line"] as number,
          message: comment["message"] as string,
          severity: comment["severity"] as Severity,
        };
      }
    );

    return {
      summary: obj["summary"] as string,
      score: obj["score"] as number,
      comments,
    };
  }
}
