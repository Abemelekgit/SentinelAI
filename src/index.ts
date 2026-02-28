/**
 * src/index.ts — SentinelAI entry point.
 *
 * Bootstraps the Probot application and registers all event handlers.
 *
 * Note: Probot v13 calls the app function twice internally (once via
 * createNodeMiddleware and once via server.load). The `loaded` guard
 * ensures handler registration is idempotent.
 */

import { Probot, run } from "probot";
import { registerPRHandler } from "./handlers/pr-handler.js";
import { registerDashboard } from "./handlers/dashboard.js";

let loaded = false;

/**
 * Main Probot application factory.
 * Probot calls this with a fully-configured `app` instance.
 */
export default function sentinelAI(
  app: Probot,
  options: { getRouter?: (path?: string) => import("express").Router }
): void {
  if (loaded) return; // Probot v13 calls this twice; guard against double registration
  loaded = true;

  app.log.info("⚡ SentinelAI is online and watching for pull requests…");

  // Register all webhook handlers
  registerPRHandler(app);

  // Register the status dashboard UI (getRouter is optional in serverless envs)
  if (options.getRouter) {
    registerDashboard(options.getRouter("/"));
  }
}

// Allow running directly: node dist/index.js
if (typeof require !== "undefined" && require.main === module) {
  run(sentinelAI).catch((err: unknown) => {
    console.error("Fatal error starting SentinelAI:", err);
    process.exit(1);
  });
}

