/**
 * src/utils/sentinel-config.ts — Validates the shape of .sentinel.yaml config.
 *
 * Prevents runtime surprises when a repo provides an invalid config file.
 */

export interface SentinelConfig {
  /** Glob patterns for files to always skip (default: []) */
  ignore?: string[];
  /** Minimum severity to post as a comment (default: "LOW") */
  minSeverity?: "HIGH" | "MED" | "LOW";
  /** Post a top-level review summary comment (default: true) */
  postSummary?: boolean;
}

export type ValidationResult =
  | { valid: true; config: SentinelConfig }
  | { valid: false; errors: string[] };

const VALID_SEVERITIES = new Set(["HIGH", "MED", "LOW"]);

/**
 * Validate the raw parsed YAML object against the SentinelConfig schema.
 *
 * @param raw - The result of `yaml.load()` — typed as `unknown`.
 * @returns A discriminated union: `{ valid: true, config }` or `{ valid: false, errors }`.
 */
export function validateSentinelConfig(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (raw === null || raw === undefined) {
    return { valid: true, config: {} };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, errors: [".sentinel.yaml must be a YAML map (object)"] };
  }

  const obj = raw as Record<string, unknown>;

  // Validate `ignore`
  if ("ignore" in obj) {
    if (!Array.isArray(obj["ignore"])) {
      errors.push("`ignore` must be an array of strings");
    } else {
      const nonStrings = (obj["ignore"] as unknown[]).filter(
        (v) => typeof v !== "string"
      );
      if (nonStrings.length > 0) {
        errors.push("`ignore` must only contain strings");
      }
    }
  }

  // Validate `minSeverity`
  if ("minSeverity" in obj) {
    if (!VALID_SEVERITIES.has(obj["minSeverity"] as string)) {
      errors.push(
        `\`minSeverity\` must be one of: HIGH, MED, LOW — got "${obj["minSeverity"]}"`
      );
    }
  }

  // Validate `postSummary`
  if ("postSummary" in obj && typeof obj["postSummary"] !== "boolean") {
    errors.push("`postSummary` must be a boolean (true or false)");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, config: obj as SentinelConfig };
}
