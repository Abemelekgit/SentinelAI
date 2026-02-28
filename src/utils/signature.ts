/**
 * src/utils/signature.ts — Webhook HMAC-SHA256 signature utilities.
 *
 * Probot already validates GitHub's X-Hub-Signature-256 header, but this
 * module provides a standalone helper for:
 *  - Testing webhook validation logic in isolation
 *  - Validating signatures on any raw payload (e.g. from a custom proxy)
 *  - Generating test signatures in integration test suites
 */

import { createHmac, timingSafeEqual } from "crypto";

const ALGORITHM = "sha256";
const PREFIX = "sha256=";

/**
 * Compute the HMAC-SHA256 signature for a raw payload string.
 *
 * @param payload  - Raw request body (UTF-8 string or Buffer)
 * @param secret   - Webhook secret configured on the GitHub App
 * @returns  The signature in the format: `sha256=<hex-digest>`
 */
export function computeSignature(
  payload: string | Buffer,
  secret: string
): string {
  const hmac = createHmac(ALGORITHM, secret);
  hmac.update(payload);
  return `${PREFIX}${hmac.digest("hex")}`;
}

/**
 * Constant-time comparison of two GitHub webhook signatures.
 * Using timingSafeEqual prevents timing-based side-channel attacks.
 *
 * @param receivedSignature - Value of the X-Hub-Signature-256 header
 * @param expectedSignature - Locally computed signature from computeSignature()
 * @returns true if the signatures match
 */
export function verifySignature(
  receivedSignature: string,
  expectedSignature: string
): boolean {
  if (!receivedSignature.startsWith(PREFIX)) return false;

  try {
    const received = Buffer.from(receivedSignature, "utf8");
    const expected = Buffer.from(expectedSignature, "utf8");

    if (received.length !== expected.length) return false;

    return timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

/**
 * Validate a raw webhook payload against GitHub's X-Hub-Signature-256 header.
 *
 * @param rawBody   - The unparsed request body as a string or Buffer
 * @param header    - The full X-Hub-Signature-256 header value
 * @param secret    - The webhook secret to validate against
 * @returns true if the payload is authentic
 */
export function isValidWebhookPayload(
  rawBody: string | Buffer,
  header: string | undefined,
  secret: string
): boolean {
  if (!header) return false;
  const expected = computeSignature(rawBody, secret);
  return verifySignature(header, expected);
}
