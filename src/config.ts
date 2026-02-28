import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

export interface AppConfig {
  // GitHub App
  appId: string;
  webhookSecret: string;
  privateKey: string;

  // AI Provider — "gemini" | "openai"
  aiProvider: "gemini" | "openai";
  geminiApiKey: string | undefined;
  openaiApiKey: string | undefined;

  // Optional Overrides
  aiModel: string;
  maxDiffChars: number;
  port: number;
}

function resolveProvider(): "gemini" | "openai" {
  const raw = optionalEnv("AI_PROVIDER", "gemini");
  if (raw !== "gemini" && raw !== "openai") {
    throw new Error(`AI_PROVIDER must be "gemini" or "openai", got: "${raw}"`);
  }
  return raw;
}

export const config: AppConfig = {
  appId: requireEnv("APP_ID"),
  webhookSecret: requireEnv("WEBHOOK_SECRET"),
  privateKey: requireEnv("PRIVATE_KEY").replace(/\\n/g, "\n"),

  aiProvider: resolveProvider(),
  geminiApiKey: optionalEnv("GEMINI_API_KEY"),
  openaiApiKey: optionalEnv("OPENAI_API_KEY"),

  aiModel:
    optionalEnv("AI_MODEL") ??
    (resolveProvider() === "gemini" ? "gemini-2.0-flash" : "gpt-4o"),

  maxDiffChars: parseInt(optionalEnv("MAX_DIFF_CHARS", "30000") ?? "30000", 10),
  port: parseInt(optionalEnv("PORT", "3000") ?? "3000", 10),
};

// Validate that the selected provider has a key
if (config.aiProvider === "gemini" && !config.geminiApiKey) {
  throw new Error("GEMINI_API_KEY is required when AI_PROVIDER=gemini");
}
if (config.aiProvider === "openai" && !config.openaiApiKey) {
  throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai");
}
