/**
 * dashboard.ts — HTTP status & demo dashboard for SentinelAI.
 *
 * Serves a visual web UI at http://localhost:3000/
 * Tracks reviews processed in-memory (resets on restart).
 */

import type { Request, Response, Router } from "express";
import { config } from "../config.js";

// ─── In-memory review log (resets on restart) ────────────────────────────────

export interface ReviewLog {
  ts: string;
  repo: string;
  pr: number;
  score: number;
  highCount: number;
  medCount: number;
  lowCount: number;
}

export const reviewLog: ReviewLog[] = [];
const startTime = new Date();

// ─── Register routes ──────────────────────────────────────────────────────────

export function registerDashboard(router: Router): void {

  router.get("/", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(buildDashboardHTML());
  });

  router.get("/api/status", (_req: Request, res: Response) => {
    const uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);
    res.json({
      status: "online",
      uptime,
      provider: config.aiProvider,
      model: config.aiModel,
      reviewsProcessed: reviewLog.length,
      startTime: startTime.toISOString(),
    });
  });

  router.get("/api/health", (_req: Request, res: Response) => {
    const uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);
    const memMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    res.json({
      status: "healthy",
      version: process.env["npm_package_version"] ?? "unknown",
      nodeVersion: process.version,
      uptime,
      memory: { heapUsedMb: parseFloat(memMb) },
      ai: {
        provider: config.aiProvider,
        model: config.aiModel,
        configured:
          config.aiProvider === "gemini"
            ? Boolean(config.geminiApiKey)
            : Boolean(config.openaiApiKey),
      },
      reviewsThisSession: reviewLog.length,
    });
  });

  router.get("/api/reviews", (_req: Request, res: Response) => {
    res.json(reviewLog.slice(-50).reverse());
  });
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildDashboardHTML(): string {
  const uptime = formatUptime(
    Math.floor((Date.now() - startTime.getTime()) / 1000)
  );

  const providerBadge =
    config.aiProvider === "gemini"
      ? `<span class="badge badge-blue">Gemini</span>`
      : `<span class="badge badge-green">OpenAI</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SentinelAI — Dashboard</title>
  <style>
    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --accent: #58a6ff;
      --green: #3fb950;
      --yellow: #d29922;
      --red: #f85149;
      --purple: #bc8cff;
      --radius: 10px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }

    /* ── Top Bar ── */
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 16px 32px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .logo {
      width: 38px; height: 38px;
      background: linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    header h1 { font-size: 20px; font-weight: 700; }
    header p  { font-size: 13px; color: var(--muted); margin-top: 2px; }
    .status-pill {
      margin-left: auto;
      display: flex; align-items: center; gap: 7px;
      background: rgba(63,185,80,.12);
      border: 1px solid rgba(63,185,80,.3);
      border-radius: 20px;
      padding: 5px 14px;
      font-size: 13px; font-weight: 600; color: var(--green);
    }
    .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--green);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%,100% { opacity:1; } 50% { opacity:.4; }
    }

    /* ── Layout ── */
    main { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }

    /* ── Stats row ── */
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 16px; margin-bottom: 32px; }
    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
    }
    .stat-card .label { font-size: 12px; text-transform: uppercase; letter-spacing: .7px; color: var(--muted); margin-bottom: 8px; }
    .stat-card .value { font-size: 28px; font-weight: 700; }
    .stat-card .sub   { font-size: 12px; color: var(--muted); margin-top: 4px; }
    .value.green  { color: var(--green);  }
    .value.blue   { color: var(--accent); }
    .value.purple { color: var(--purple); }
    .value.yellow { color: var(--yellow); }

    /* ── Two-column ── */
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    @media(max-width:700px){ .cols{ grid-template-columns:1fr; } }

    /* ── Card ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .card-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      font-weight: 600; font-size: 14px;
      display: flex; align-items: center; gap: 8px;
    }
    .card-body { padding: 20px; }

    /* ── Config table ── */
    .config-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .config-table tr:not(:last-child) td { border-bottom: 1px solid var(--border); }
    .config-table td { padding: 10px 4px; }
    .config-table td:first-child { color: var(--muted); width: 50%; }
    .config-table td:last-child  { font-family: monospace; font-size: 12px; }

    /* ── Flow diagram ── */
    .flow {
      display: flex;
      align-items: center;
      gap: 0;
      flex-wrap: wrap;
      justify-content: center;
      padding: 8px 0;
    }
    .flow-step {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; max-width: 110px; text-align: center;
    }
    .flow-icon {
      width: 52px; height: 52px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px;
    }
    .flow-label { font-size: 11px; color: var(--muted); line-height: 1.4; }
    .flow-arrow { font-size: 20px; color: var(--border); padding: 0 4px; margin-top: -16px; }
    .step-1 { background: rgba(88,166,255,.15); }
    .step-2 { background: rgba(63,185,80,.15); }
    .step-3 { background: rgba(188,140,255,.15); }
    .step-4 { background: rgba(210,153,34,.15); }
    .step-5 { background: rgba(248,81,73,.12); }

    /* ── Badges ── */
    .badge {
      display: inline-block;
      border-radius: 20px;
      padding: 2px 10px;
      font-size: 11px; font-weight: 600;
    }
    .badge-blue   { background: rgba(88,166,255,.2); color: var(--accent); border: 1px solid rgba(88,166,255,.3); }
    .badge-green  { background: rgba(63,185,80,.2);  color: var(--green);  border: 1px solid rgba(63,185,80,.3); }
    .badge-red    { background: rgba(248,81,73,.2);  color: var(--red);    border: 1px solid rgba(248,81,73,.3); }
    .badge-yellow { background: rgba(210,153,34,.2); color: var(--yellow); border: 1px solid rgba(210,153,34,.3); }

    /* ── Setup steps ── */
    .steps { list-style: none; }
    .steps li {
      display: flex; gap: 14px; align-items: flex-start;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }
    .steps li:last-child { border-bottom: none; }
    .step-num {
      width: 24px; height: 24px; border-radius: 50%;
      background: var(--accent);
      color: #000;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; flex-shrink: 0; margin-top: 1px;
    }
    .steps .cmd {
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 10px;
      font-family: monospace; font-size: 12px;
      color: var(--accent);
      margin-top: 6px; display: block;
    }

    /* ── Log table ── */
    .log-table { width:100%; border-collapse:collapse; font-size:13px; }
    .log-table th { color:var(--muted); font-weight:500; font-size:11px; text-transform:uppercase; letter-spacing:.5px; padding:8px 10px; border-bottom:1px solid var(--border); text-align:left; }
    .log-table td { padding: 10px; border-bottom:1px solid var(--border); }
    .log-table tr:last-child td { border-bottom:none; }
    .empty { color:var(--muted); font-size:13px; text-align:center; padding:32px 0; }

    /* ── Score bar ── */
    .score-bar { display:inline-block; font-family:monospace; font-size:11px; color:var(--green); }

    footer { text-align:center; padding:32px; font-size:12px; color:var(--muted); }
  </style>
</head>
<body>

<header>
  <div class="logo">🛡️</div>
  <div>
    <h1>SentinelAI</h1>
    <p>Autonomous AI Code Reviewer · GitHub App</p>
  </div>
  <div class="status-pill">
    <div class="dot"></div>
    Online
  </div>
</header>

<main>

  <!-- Stats Row -->
  <div class="stats">
    <div class="stat-card">
      <div class="label">Status</div>
      <div class="value green">Online</div>
      <div class="sub">Uptime: ${uptime}</div>
    </div>
    <div class="stat-card">
      <div class="label">AI Provider</div>
      <div class="value blue">${config.aiProvider === "gemini" ? "Gemini" : "OpenAI"}</div>
      <div class="sub">${config.aiModel}</div>
    </div>
    <div class="stat-card">
      <div class="label">Reviews Processed</div>
      <div class="value purple" id="review-count">0</div>
      <div class="sub">This session</div>
    </div>
    <div class="stat-card">
      <div class="label">Diff Limit</div>
      <div class="value yellow">${(config.maxDiffChars / 1000).toFixed(0)}k</div>
      <div class="sub">chars per review</div>
    </div>
  </div>

  <!-- Architecture + Config -->
  <div class="cols">

    <!-- How it works -->
    <div class="card">
      <div class="card-header">⚡ How It Works</div>
      <div class="card-body">
        <div class="flow">
          <div class="flow-step">
            <div class="flow-icon step-1">🔔</div>
            <div class="flow-label"><strong>PR Event</strong><br>opened / sync</div>
          </div>
          <div class="flow-arrow">→</div>
          <div class="flow-step">
            <div class="flow-icon step-2">📥</div>
            <div class="flow-label"><strong>Fetch Diff</strong><br>GitHub API</div>
          </div>
          <div class="flow-arrow">→</div>
          <div class="flow-step">
            <div class="flow-icon step-3">🧹</div>
            <div class="flow-label"><strong>Clean</strong><br>DiffService</div>
          </div>
          <div class="flow-arrow">→</div>
          <div class="flow-step">
            <div class="flow-icon step-4">🤖</div>
            <div class="flow-label"><strong>AI Review</strong><br>${config.aiModel}</div>
          </div>
          <div class="flow-arrow">→</div>
          <div class="flow-step">
            <div class="flow-icon step-5">💬</div>
            <div class="flow-label"><strong>Post Review</strong><br>inline comments</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Config -->
    <div class="card">
      <div class="card-header">⚙️ Configuration</div>
      <div class="card-body">
        <table class="config-table">
          <tr>
            <td>AI Provider</td>
            <td>${providerBadge}</td>
          </tr>
          <tr>
            <td>Model</td>
            <td>${config.aiModel}</td>
          </tr>
          <tr>
            <td>Max Diff Size</td>
            <td>${config.maxDiffChars.toLocaleString()} chars</td>
          </tr>
          <tr>
            <td>App ID</td>
            <td>${config.appId.substring(0, 6)}••••</td>
          </tr>
          <tr>
            <td>Webhook Secret</td>
            <td>••••••••</td>
          </tr>
          <tr>
            <td>Webhook Endpoint</td>
            <td>POST /api/github/webhooks</td>
          </tr>
          <tr>
            <td>Health Check</td>
            <td><a href="/ping" style="color:var(--accent)">GET /ping</a></td>
          </tr>
        </table>
      </div>
    </div>
  </div>

  <!-- Review Log + Setup -->
  <div class="cols">

    <!-- Recent Reviews -->
    <div class="card">
      <div class="card-header">📋 Recent Reviews <span id="log-count" style="color:var(--muted);font-weight:400;font-size:12px;margin-left:4px"></span></div>
      <div class="card-body" style="padding:0">
        <div id="review-log">
          <div class="empty">No reviews yet this session.<br>Open a PR in a connected repo to trigger SentinelAI.</div>
        </div>
      </div>
    </div>

    <!-- Setup Checklist -->
    <div class="card">
      <div class="card-header">🚀 Getting Started</div>
      <div class="card-body" style="padding:0 20px">
        <ul class="steps">
          <li>
            <div class="step-num">1</div>
            <div>
              <strong>Create a GitHub App</strong><br>
              <span style="color:var(--muted)">Settings → Developer settings → GitHub Apps → New</span>
            </div>
          </li>
          <li>
            <div class="step-num">2</div>
            <div>
              <strong>Fill in .env credentials</strong><br>
              <span style="color:var(--muted)">APP_ID, PRIVATE_KEY, WEBHOOK_SECRET</span>
              <code class="cmd">cp .env.example .env</code>
            </div>
          </li>
          <li>
            <div class="step-num">3</div>
            <div>
              <strong>Forward webhooks via smee.io</strong>
              <code class="cmd">npx smee-client --url https://smee.io/CHANNEL --target http://localhost:3000/api/github/webhooks</code>
            </div>
          </li>
          <li>
            <div class="step-num">4</div>
            <div>
              <strong>Install the App on a repo</strong><br>
              <span style="color:var(--muted)">GitHub App settings → Install → select repositories</span>
            </div>
          </li>
          <li>
            <div class="step-num">5</div>
            <div>
              <strong>Open a Pull Request 🎉</strong><br>
              <span style="color:var(--muted)">SentinelAI will auto-review and post inline comments.</span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Severity Legend -->
  <div class="card" style="margin-bottom:24px">
    <div class="card-header">🏷️ Review Comment Severity</div>
    <div class="card-body" style="display:flex;gap:32px;flex-wrap:wrap">
      <div>
        <span class="badge badge-red">HIGH</span>
        <span style="color:var(--muted);font-size:13px;margin-left:10px">Exploitable security flaw or crash-causing bug — must fix before merge</span>
      </div>
      <div>
        <span class="badge badge-yellow">MED</span>
        <span style="color:var(--muted);font-size:13px;margin-left:10px">Code smell or risk that should be addressed soon</span>
      </div>
      <div>
        <span class="badge badge-blue">LOW</span>
        <span style="color:var(--muted);font-size:13px;margin-left:10px">Minor improvement, style note, or optimisation suggestion</span>
      </div>
    </div>
  </div>

</main>
<footer>
  SentinelAI · Probot v13 · Node.js ${process.version} · Port ${config.port}
</footer>

<script>
  // Poll /api/reviews every 5 seconds and update the log table
  async function loadReviews() {
    try {
      const [statusRes, reviewsRes] = await Promise.all([
        fetch('/api/status').then(r => r.json()),
        fetch('/api/reviews').then(r => r.json()),
      ]);

      document.getElementById('review-count').textContent = statusRes.reviewsProcessed;

      const container = document.getElementById('review-log');
      const countEl = document.getElementById('log-count');

      if (!reviewsRes.length) {
        container.innerHTML = \`<div class="empty">No reviews yet this session.<br>Open a PR in a connected repo to trigger SentinelAI.</div>\`;
        countEl.textContent = '';
        return;
      }

      countEl.textContent = '(' + reviewsRes.length + ')';

      const rows = reviewsRes.map(r => {
        const bar = '█'.repeat(Math.round(r.score)) + '░'.repeat(10 - Math.round(r.score));
        return \`<tr>
          <td><strong>\${r.repo}</strong><br><span style="color:var(--muted);font-size:11px">\${r.ts}</span></td>
          <td>#\${r.pr}</td>
          <td>\${r.score}/10<br><span class="score-bar">\${bar}</span></td>
          <td>
            \${r.highCount ? '<span class="badge badge-red">'+r.highCount+' HIGH</span> ' : ''}
            \${r.medCount  ? '<span class="badge badge-yellow">'+r.medCount+' MED</span> ' : ''}
            \${r.lowCount  ? '<span class="badge badge-blue">'+r.lowCount+' LOW</span>' : ''}
          </td>
        </tr>\`;
      }).join('');

      container.innerHTML = \`
        <table class="log-table">
          <thead><tr><th>Repository</th><th>PR</th><th>Score</th><th>Issues</th></tr></thead>
          <tbody>\${rows}</tbody>
        </table>\`;
    } catch(e) {
      console.error('Dashboard poll error:', e);
    }
  }

  loadReviews();
  setInterval(loadReviews, 5000);
</script>
</body>
</html>`;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
