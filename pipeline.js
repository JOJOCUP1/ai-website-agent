// pipeline.js — Core plan → approve → execute pipeline
const fs   = require("fs");
const path = require("path");

const { callGemini }                         = require("./integrations/gemini");
const { backupFiles, gitPush }               = require("./integrations/github");
const { takeScreenshot }                     = require("./integrations/playwright");
const { scanCommand, scanFileContent }       = require("./modules/safety");
const { readSmart }                          = require("./modules/openspace");
const Prism                                  = require("./modules/prism");
const Hermes                                 = require("./modules/hermes");
const Hindsight                              = require("./modules/hindsight");
const { buildPlanPrompt, buildExecutePrompt } = require("./modules/gsd");
const { log }                                = require("./modules/logger");

const WEBSITE_DIR = process.env.WEBSITE_DIR;
const WEBSITE_URL = process.env.WEBSITE_URL || "";

// ── Approval store (per chat ID) ─────────────────────────────────
// Structure: { command, plan, files, memory, createdAt }
const pendingApprovals = new Map();
const APPROVAL_TTL_MS  = 5 * 60 * 1000; // 5 minutes

function setPending(chatId, data) {
  pendingApprovals.set(String(chatId), { ...data, createdAt: Date.now() });
}

function getPending(chatId) {
  const entry = pendingApprovals.get(String(chatId));
  if (!entry) return null;
  if (Date.now() - entry.createdAt > APPROVAL_TTL_MS) {
    pendingApprovals.delete(String(chatId));
    return null; // expired
  }
  return entry;
}

function clearPending(chatId) {
  pendingApprovals.delete(String(chatId));
}

function hasPending(chatId) {
  return !!getPending(chatId);
}

// ── Plan phase ───────────────────────────────────────────────────
async function runPipeline(chatId, command) {
  // 1. Safety scan
  const safety = scanCommand(command);
  if (!safety.safe) return { ok: false, message: safety.reason };

  // 2. Read files + knowledge
  const files     = readSmart(WEBSITE_DIR, command);
  const knowledge = Prism.scan(WEBSITE_DIR);
  const memory    = Hermes.getCompressedContext();

  if (Object.keys(files).length === 0) {
    return { ok: false, message: "❌ No HTML/CSS/JS files found in WEBSITE\\_DIR." };
  }

  // 3. GSD Plan (Gemini)
  const planPrompt = buildPlanPrompt(command, files, memory, knowledge);
  const plan = await callGemini(planPrompt);

  // Validate plan shape
  if (!plan?.understood || !Array.isArray(plan.plan) || !Array.isArray(plan.files_to_change)) {
    throw new Error("Gemini returned invalid plan structure");
  }

  // Store pending approval (keyed by chatId)
  setPending(chatId, { command, plan, files, memory });

  const riskEmoji = { high: "🔴", medium: "🟡", low: "🟢" }[plan.risk] || "⚪";

  const msg =
    `📋 *Plan Ready*\n\n` +
    `📌 ${plan.understood}\n` +
    `${riskEmoji} Risk: *${plan.risk}* — ${plan.risk_reason}\n\n` +
    `*Steps:*\n${plan.plan.map((s, i) => `${i + 1}\\. ${s}`).join("\n")}\n\n` +
    `📄 Will change: \`${plan.files_to_change.join(", ")}\`\n` +
    `🔒 Won't touch: \`${plan.files_to_leave_alone.join(", ")}\`\n\n` +
    `Reply *yes* to execute or *no* to cancel \\(expires in 5 min\\)`;

  return { ok: true, message: msg };
}

// ── Execute phase ────────────────────────────────────────────────
async function executeApproved(chatId, sendFn) {
  const pending = getPending(chatId);
  if (!pending) return { ok: false, message: "❌ No pending approval \\(may have expired\\)\\." };
  clearPending(chatId);

  const { command, plan, files, memory } = pending;
  const t0 = Date.now();

  // Backup files before touching them
  backupFiles(plan.files_to_change);

  // Gemini execute
  const execPrompt = buildExecutePrompt(command, plan, files, memory);
  const result     = await callGemini(execPrompt);

  if (!result?.changes?.length) {
    return { ok: false, message: `⚠️ No changes returned\\. ${result?.summary || ""}` };
  }

  // Validate + write only approved files
  const written = [];
  const blocked = [];

  for (const change of result.changes) {
    if (!plan.files_to_change.includes(change.file)) {
      blocked.push(change.file);
      continue;
    }
    if (!change.content || change.content.trim().length < 10) {
      log.warn(`Empty content for ${change.file} — skipped`);
      continue;
    }

    // File content safety scan
    const contentSafety = scanFileContent(change.file, change.content);
    if (!contentSafety.safe) {
      log.warn(`Content scan blocked ${change.file}: ${contentSafety.reason}`);
      blocked.push(change.file + " (content scan)");
      continue;
    }

    fs.writeFileSync(path.join(WEBSITE_DIR, change.file), change.content, "utf8");
    written.push(change.file);
  }

  if (written.length === 0) {
    return { ok: false, message: `⚠️ All changes were blocked\\. Files: ${blocked.join(", ")}` };
  }

  // Git push
  gitPush(`agent: ${command.slice(0, 60)}`);

  const durationMs = Date.now() - t0;
  Hermes.remember(command, result.summary, true);
  Hindsight.record(command, result.summary, written, true, durationMs);

  const doneMsg =
    `✅ *Done\\!*\n\n` +
    `📝 ${result.summary}\n` +
    `📄 Files: \`${written.join(", ")}\`\n` +
    (blocked.length ? `⛔ Blocked: \`${blocked.join(", ")}\`\n` : "") +
    `⏱ ${(durationMs / 1000).toFixed(1)}s\n` +
    `🚀 GitHub → Vercel \\(~30 sec\\)`;

  // Playwright screenshot
  if (WEBSITE_URL && sendFn) {
    sendFn(doneMsg + "\n\n📸 _Taking screenshot in 35 sec\\.\\.\\._").catch(() => {});
    setTimeout(async () => {
      const screenshotPath = await takeScreenshot(WEBSITE_URL);
      if (screenshotPath) {
        sendFn({ photo: screenshotPath, caption: `✅ Live: ${WEBSITE_URL}` }).catch(() => {});
      } else {
        sendFn(`🌐 Live at: ${WEBSITE_URL}`).catch(() => {});
      }
    }, 35_000);
    return { ok: true, message: null }; // already sent
  }

  return { ok: true, message: doneMsg };
}

module.exports = { runPipeline, executeApproved, hasPending, clearPending };
