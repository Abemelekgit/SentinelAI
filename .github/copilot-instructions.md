# Context for GitHub Copilot

## Project
SentinelAI is a **Probot-based GitHub App** written in **TypeScript (strict mode)**.
It automatically reviews Pull Requests using an LLM (Gemini or OpenAI) and posts
inline review comments with severity ratings.

---

## Architecture Pattern
Follow the **Service-Handler** pattern:

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Entry point | `src/index.ts` | Bootstraps Probot, registers handlers |
| Handlers | `src/handlers/` | Receive webhook events, orchestrate services |
| Services | `src/services/` | Stateless business logic (AI, diff parsing) |
| Config | `src/config.ts` | Validated env-var access (single source of truth) |

---

## Key Rules

### No `any` types
All AI JSON responses must be parsed against defined TypeScript interfaces.
See `src/services/ai.ts` → `ReviewResponse`, `ReviewComment`.

### Environment Variables
Access **only** through the validated `config` object in `src/config.ts`.
Never call `process.env` directly in handlers or services.

### GitHub API
- Use `context.octokit.pulls.createReview` to post inline review comments.
- Use `context.octokit.pulls.get` with `mediaType: { format: "diff" }` to fetch diffs.
- Octokit review comment positions use **new-file line numbers**, not diff positions.

### Error Handling
All webhook handlers must catch errors and post a degraded-mode comment to the PR
so the author knows the bot ran, even if the review failed.

### AI Response Parsing
Always validate the shape of AI JSON in `AIService.validate()` before using it.
The LLM may return extra fields or malformed data — be defensive.

### .sentinel.yaml
Per-repo config is loaded via `loadSentinelConfig()` in `pr-handler.ts`.
Respect `ignore`, `minSeverity`, and `postSummary` settings.

---

## Naming Conventions
- Services: `*.service.ts` or `*.ts` inside `src/services/`
- Handlers: `*-handler.ts` inside `src/handlers/`
- Interfaces: PascalCase (`ReviewComment`, `FileDiff`)
- Env vars: SCREAMING_SNAKE_CASE (`GEMINI_API_KEY`)

---

## Adding a New AI Provider
1. Add the provider key to `AppConfig` in `src/config.ts`.
2. Add a `callXxx()` method in `AIService`.
3. Route to it in `AIService.review()` based on `config.aiProvider`.
