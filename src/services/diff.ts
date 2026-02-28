/**
 * DiffService — Parses, cleans, and truncates raw git diffs.
 *
 * Responsibilities:
 *  - Split a unified diff into per-file chunks.
 *  - Strip binary blobs and lock-file noise.
 *  - Truncate each chunk so the total payload stays within the LLM context budget.
 *  - Build a line-map so AI comments can reference real GitHub PR line numbers.
 */

export interface FileDiff {
  /** Relative file path (e.g. "src/auth/login.ts") */
  path: string;
  /** Cleaned diff body for this file */
  patch: string;
  /**
   * Map from diff line index (1-based within `patch`) → actual file line number.
   * Only "+" lines are indexed; "-" lines are omitted (they don't exist in the
   * new file and GitHub expects new-file line positions for review comments).
   */
  lineMap: Map<number, number>;
}

// Files whose diffs we should always skip — they add noise, not signal.
const NOISE_PATH_PATTERNS: RegExp[] = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /composer\.lock$/,
  /Gemfile\.lock$/,
  /poetry\.lock$/,
  /.*\.min\.js$/,
  /.*\.min\.css$/,
  /dist\//,
  /build\//,
  /\.next\//,
  /coverage\//,
];

// Heuristic: if a diff section looks like a binary blob, skip it.
const BINARY_HEADER = /^Binary files /;

export class DiffService {
  private readonly maxTotalChars: number;

  constructor(maxTotalChars = 30_000) {
    this.maxTotalChars = maxTotalChars;
  }

  /**
   * Parse a raw unified diff string into structured per-file objects,
   * filtering noise and ensuring the total character budget is respected.
   */
  parse(rawDiff: string): FileDiff[] {
    if (!rawDiff || rawDiff.trim().length === 0) return [];

    const rawFiles = this.splitByFile(rawDiff);
    const results: FileDiff[] = [];
    let totalChars = 0;

    for (const { path, raw } of rawFiles) {
      if (this.isNoise(path, raw)) continue;

      const patch = this.cleanPatch(raw);
      const truncated = this.truncate(patch, this.maxTotalChars - totalChars);
      if (!truncated) continue;

      totalChars += truncated.length;
      results.push({
        path,
        patch: truncated,
        lineMap: this.buildLineMap(truncated),
      });

      if (totalChars >= this.maxTotalChars) break;
    }

    return results;
  }

  /**
   * Split a unified diff into per-file sections.
   * Each section starts with a "diff --git" header line.
   */
  private splitByFile(diff: string): { path: string; raw: string }[] {
    // Split on `diff --git a/... b/...` boundaries
    const sections = diff.split(/^(?=diff --git )/m).filter(Boolean);

    return sections.map((section) => {
      // Extract the "b/" path from the diff header (the new/destination file)
      const headerMatch = section.match(/^diff --git a\/.+ b\/(.+)$/m);
      const path = headerMatch ? headerMatch[1].trim() : "";
      return { path, raw: section };
    }).filter((f) => f.path.length > 0);
  }

  /** Returns true when the file should be skipped entirely. */
  private isNoise(path: string, raw: string): boolean {
    if (NOISE_PATH_PATTERNS.some((re) => re.test(path))) return true;
    if (BINARY_HEADER.test(raw)) return true;
    return false;
  }

  /**
   * Remove git diff metadata lines that are not useful to the LLM
   * (index lines, mode changes, similarity scores, etc.).
   */
  private cleanPatch(raw: string): string {
    return raw
      .split("\n")
      .filter((line) => {
        // Keep hunk headers and actual diff content
        if (line.startsWith("@@")) return true;
        if (line.startsWith("+")) return true;
        if (line.startsWith("-")) return true;
        if (line.startsWith(" ")) return true; // context line
        // Skip git metadata
        return false;
      })
      .join("\n");
  }

  /** Hard-truncate patch to fit within the remaining character budget. */
  private truncate(patch: string, remaining: number): string | null {
    if (remaining <= 0) return null;
    if (patch.length <= remaining) return patch;

    // Truncate at a newline boundary to avoid splitting a hunk mid-line
    const cut = patch.lastIndexOf("\n", remaining);
    const sliced = cut > 0 ? patch.slice(0, cut) : patch.slice(0, remaining);
    return sliced + "\n// [truncated — diff too large]";
  }

  /**
   * Build a mapping from 1-based diff line index → new file line number.
   *
   * A hunk header looks like:  @@ -oldStart,oldCount +newStart,newCount @@
   * We track the newStart counter and advance it only for "+" and " " lines.
   */
  private buildLineMap(patch: string): Map<number, number> {
    const map = new Map<number, number>();
    const lines = patch.split("\n");

    let newFileLine = 0; // current position in the new file
    let diffLineIndex = 0; // 1-based position within `patch`

    const hunkHeader = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

    for (const line of lines) {
      diffLineIndex++;

      const hunkMatch = line.match(hunkHeader);
      if (hunkMatch) {
        newFileLine = parseInt(hunkMatch[1], 10) - 1;
        continue;
      }

      if (line.startsWith("+")) {
        newFileLine++;
        map.set(diffLineIndex, newFileLine);
      } else if (line.startsWith(" ")) {
        newFileLine++; // context line advances the counter but is not mapped
      }
      // "-" lines do not exist in the new file — not mapped
    }

    return map;
  }

  /**
   * Serialise all FileDiff patches into a single string to send to the LLM.
   * Each file section is clearly delimited.
   */
  serialize(diffs: FileDiff[]): string {
    return diffs
      .map((d) => `=== FILE: ${d.path} ===\n${d.patch}`)
      .join("\n\n");
  }
}
