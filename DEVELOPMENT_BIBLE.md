# 📖 SentinelAI: The Development Bible

> **Project:** SentinelAI — An Autonomous AI Code Reviewer  
> **Architecture:** Event-Driven GitHub App (Probot)  
> **Primary Engine:** Gemini 2.0 Flash / GPT-4o

---

## 🎯 1. The Core Vision

SentinelAI is a "Digital Senior Engineer" that lives in your GitHub CI/CD pipeline.
It automatically reviews Pull Requests to catch bugs, security leaks, and performance
debt before a human developer ever clicks "Review."

### High-Level Flow

```
Trigger  → PR is opened or updated
Fetch    → Bot pulls the git diff via GitHub API (mediaType: diff)
Analyze  → Bot sends diff + Brain Prompt to the AI
Action   → Bot posts line-specific comments + a summary score to the PR
```

---

## 🛠️ 2. Technical Stack & Standards

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js v20+ (LTS) |
| Language | TypeScript (Strict Mode) |
| Framework | Probot |
| AI — Gemini | `@google/generative-ai` |
| AI — OpenAI | `openai` |
| Config parsing | `js-yaml` |
| Deployment | Serverless (Vercel / Railway) |

---

## 🚀 3. The 3-Phase Roadmap

### Phase 1: The Skeleton (Days 1–2)

- [x] Create GitHub App & generate `PRIVATE_KEY` and `APP_ID`.
- [x] Initialise project with Probot + TypeScript.
- [ ] Connect local environment to GitHub via [smee.io](https://smee.io).
- **Goal:** Bot says "I see this PR!" in a comment.

### Phase 2: The Intelligence (Days 3–5)

- [x] Implement `DiffService` to clean and truncate massive diffs.
- [x] Implement `AIService` to communicate with Gemini / OpenAI.
- [x] Inject the Brain Prompt into the LLM context.
- **Goal:** Bot gives a generic AI review of the code.

### Phase 3: The Precision (Days 6–7)

- [x] Map AI JSON response to specific line and path in GitHub.
- [x] Add `.sentinel.yaml` support for user-defined rules.
- [x] Add "Review Summary" with a 1–10 code quality score.
- **Goal:** Inline PR comments with severity badges.

---

## 🧠 4. The "Brain" (AI System Prompt)

```
Role: Senior Full-Stack Security Engineer.

Task: Analyse the provided git diff. Identify logic errors, security flaws
(SQL injection, XSS, hardcoded keys), and performance issues.

Output Format: Strict JSON only — no markdown fences.

Schema:
{
  "summary": "High-level overview of the PR",
  "score": 8,
  "comments": [
    {
      "file": "src/auth/login.ts",
      "line": 42,
      "message": "Possible SQL injection — use parameterised queries.",
      "severity": "HIGH|MED|LOW"
    }
  ]
}

Constraint: Only comment on actual issues. If code is perfect, return an
empty `comments` array.
```

---

## 📂 5. File Structure

```
├── .github/
│   └── copilot-instructions.md   # IDE / Copilot guidance
├── src/
│   ├── services/
│   │   ├── ai.ts                 # LLM Logic (Gemini + OpenAI)
│   │   └── diff.ts               # Git Diff Parsing & Truncation
│   ├── handlers/
│   │   └── pr-handler.ts         # Webhook Events Orchestration
│   ├── index.ts                  # Entry Point
│   └── config.ts                 # Validated env-var access
├── .env.example                  # Environment template
├── .gitignore
├── .sentinel.yaml                # Per-repo SentinelAI config (sample)
├── DEVELOPMENT_BIBLE.md          # This file
├── package.json
└── tsconfig.json
```

---

## ⚙️ 6. Local Development Setup

### Prerequisites

- Node.js v20+
- A GitHub App (see below)
- Gemini or OpenAI API key

### Step 1 — Create a GitHub App

1. Go to `Settings → Developer settings → GitHub Apps → New GitHub App`.
2. Set **Webhook URL** to your smee.io proxy URL (e.g. `https://smee.io/AbC123`).
3. Set **Webhook Secret** to any random string.
4. Add **Repository permissions**:
   - Pull requests: **Read & Write**
   - Contents: **Read**
5. Subscribe to events: `Pull request`.
6. Generate and download the **Private Key** (`.pem` file).

### Step 2 — Configure Environment

```bash
cp .env.example .env
# Fill in APP_ID, WEBHOOK_SECRET, PRIVATE_KEY, and GEMINI_API_KEY
```

### Step 3 — Install & Run

```bash
npm install
npm run dev
```

### Step 4 — Forward webhooks locally

```bash
npx smee-client --url https://smee.io/YOUR_CHANNEL --target http://localhost:3000/api/github/webhooks
```

---

## 🚢 7. Deployment (Railway / Vercel)

Set the same environment variables from `.env.example` in your platform's secrets dashboard.

For Railway:
```bash
railway up
```

For Vercel (serverless):
```bash
vercel --prod
```

---

## 🔐 8. Security Notes

- **Never commit `.env`** — it contains your private key and API secrets.
- The `PRIVATE_KEY` in the env file uses `\n` as literal newline escapes.
  The config loader handles conversion automatically.
- AI responses are **always validated** against the `ReviewResponse` schema
  before any data is used. Malformed responses trigger a degraded comment.
