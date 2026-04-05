// bot.js — Telegram bot: secure message routing + all commands
const TelegramBot = require("node-telegram-bot-api");
const { log }     = require("./modules/logger");
const { setSendFn } = require("./modules/scheduler");

const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_ID = String(process.env.TELEGRAM_CHAT_ID); // only this chat is served

const Hermes    = require("./modules/hermes");
const Prism     = require("./modules/prism");
const Hindsight = require("./modules/hindsight");
const Scheduler = require("./modules/scheduler");
const { gitUndo, gitDiff, restoreLastBackup } = require("./integrations/github");
const { takeScreenshot } = require("./integrations/playwright");
const { runPipeline, executeApproved, hasPending, clearPending } = require("./pipeline");

const WEBSITE_DIR = process.env.WEBSITE_DIR;
const WEBSITE_URL = process.env.WEBSITE_URL || "";
const fs = require("fs");

let bot;

// ── Send helpers ─────────────────────────────────────────────────
function send(text) {
  if (typeof text === "object" && text.photo) {
    return bot.sendPhoto(ALLOWED_ID, text.photo, { caption: text.caption || "" })
      .catch((e) => bot.sendMessage(ALLOWED_ID, `📸 Screenshot taken: ${WEBSITE_URL}`));
  }
  const safe = String(text).slice(0, 4000);
  return bot.sendMessage(ALLOWED_ID, safe, { parse_mode: "MarkdownV2" })
    .catch(() => bot.sendMessage(ALLOWED_ID, safe)); // fallback: no markdown
}

// ── Security: reject all non-allowed chat IDs ────────────────────
function isAllowed(chatId) {
  return String(chatId) === ALLOWED_ID;
}

// ── Command handlers ─────────────────────────────────────────────
async function handleCommand(text, chatId) {
  // /start /help
  if (text === "/start" || text === "/help") {
    return send(
      `🤖 *Agent v5\\.0 — Commands*\n\n` +
      `Just type what you want changed on your website\\.\n\n` +
      `*Flow:* Analyze → Plan → You approve → Execute → Screenshot\n\n` +
      `/status — system overview\n` +
      `/memory — learned history\n` +
      `/files — website files list\n` +
      `/search \\[query\\] — find code\n` +
      `/scan — rebuild knowledge graph\n` +
      `/diff — last change diff\n` +
      `/undo — revert last git commit\n` +
      `/rollback — restore pre\\-deploy file backup\n` +
      `/schedule — scheduled tasks\n` +
      `/screenshot — capture live site\n` +
      `/stats — performance stats\n` +
      `/help — this message`
    );
  }

  // /status
  if (text === "/status") {
    const mem    = Hermes.getStats();
    const kg     = Prism.load();
    const stats  = Hindsight.getStats();
    const files  = fs.readdirSync(WEBSITE_DIR)
      .filter((f) => [".html", ".css", ".js"].includes(require("path").extname(f)));

    return send(
      `📊 *Agent v5\\.0 Status*\n\n` +
      `🟢 Bot: Online\n` +
      `📁 \`${WEBSITE_DIR}\`\n` +
      `📄 Files: ${files.join(", ")}\n` +
      `🧠 Commands: ${mem.totalCommands} \\| Success: ${mem.successRate}%\n` +
      `🗺 Knowledge: ${Object.keys(kg.files).length} files, ${kg.components.length} components\n` +
      `📈 Avg exec time: ${stats.avgMs}ms\n` +
      `⏳ Pending: ${hasPending(chatId) ? "YES — type yes/no" : "none"}\n` +
      `📸 Screenshot: ${WEBSITE_URL ? "enabled" : "disabled \\(set WEBSITE\\_URL\\)"}\n` +
      `🌙 AutoResearch: 02:00 daily\n` +
      `🤖 AI: Gemini 2\\.5 Flash`
    );
  }

  // /memory
  if (text === "/memory") {
    const history = Hermes.getHistory(10);
    const lines   = history
      .map((h, i) => `${i + 1}\\. ${h.success ? "✅" : "❌"} ${h.command.slice(0, 50)}`)
      .join("\n");
    return send(`🧠 *Hermes Memory*\n\n${lines || "none yet"}`);
  }

  // /files
  if (text === "/files") {
    const kg    = Prism.load();
    const lines = Object.entries(kg.files)
      .map(([f, d]) => `• \`${f}\` — ${d.lines} lines`)
      .join("\n");
    return send(`📁 *Website Files*\n\n${lines || "none"}`);
  }

  // /search
  if (text.startsWith("/search ")) {
    const query   = text.slice(8).trim();
    const results = Prism.search(query, WEBSITE_DIR);
    if (!results.length) return send(`🔍 Nothing found for: "${query}"`);
    const msg = results
      .map((r) => `📄 \`${r.file}:${r.line}\`\n\`${r.content}\``)
      .join("\n\n");
    return send(`🔍 *Search: "${query}"*\n\n${msg}`);
  }

  // /scan
  if (text === "/scan") {
    const kg = Prism.scan(WEBSITE_DIR);
    return send(
      `🗺 *Knowledge Graph Updated*\n\n` +
      `Files: ${Object.keys(kg.files).join(", ")}\n` +
      `Components: ${kg.components.slice(0, 10).join(", ")}`
    );
  }

  // /diff
  if (text === "/diff") {
    const diff = gitDiff();
    return send(`📝 *Last Change Diff*\n\n\`\`\`\n${diff.slice(0, 2000)}\n\`\`\``);
  }

  // /undo
  if (text === "/undo") {
    try {
      gitUndo();
      return send("↩️ *Undone\\!* Last commit reverted and pushed\\.");
    } catch (e) {
      return send(`❌ Undo failed: ${e.message.slice(0, 300)}`);
    }
  }

  // /rollback
  if (text === "/rollback") {
    try {
      const result = restoreLastBackup();
      return send(
        `↩️ *Rollback complete\\!*\n\n` +
        `Restored from: \`${result.backupTs}\`\n` +
        `Files: ${result.files.join(", ")}`
      );
    } catch (e) {
      return send(`❌ Rollback failed: ${e.message}`);
    }
  }

  // /schedule
  if (text === "/schedule") {
    const tasks = Scheduler.getStatus();
    const lines = tasks.map((t) => `• ${t.name}: ${t.nextRun}`).join("\n");
    return send(`⏰ *Scheduled Tasks*\n\n${lines || "none"}\n🌙 AutoResearch: 02:00 daily`);
  }

  // /screenshot
  if (text === "/screenshot") {
    if (!WEBSITE_URL) return send("❌ Set WEBSITE\\_URL in \\.env first\\.");
    await send("📸 _Taking screenshot\\.\\.\\._");
    const sc = await takeScreenshot(WEBSITE_URL);
    if (sc) return send({ photo: sc, caption: WEBSITE_URL });
    return send("❌ Screenshot failed\\.");
  }

  // /stats
  if (text === "/stats") {
    const s = Hindsight.getStats();
    const m = Hermes.getStats();
    return send(
      `📈 *Performance Stats*\n\n` +
      `Total executions: ${s.total}\n` +
      `Success: ${s.success} \\| Fail: ${s.fail}\n` +
      `Avg exec time: ${s.avgMs}ms\n` +
      `Skills learned: ${m.skills}\n` +
      `User profile: ${Object.keys(m.profile).join(", ") || "general"}`
    );
  }

  return null; // not a command
}

// ── Message router ───────────────────────────────────────────────
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text   = (msg.text || "").trim();

  // 🔐 Security gate — reject all other users
  if (!isAllowed(chatId)) {
    log.warn(`Rejected message from unauthorized chat: ${chatId}`);
    return;
  }
  if (!text) return;

  log.info(`← [${chatId}] ${text.slice(0, 80)}`);

  try {
    // ── YES: execute approved plan ──────────────────────────────
    if (text.toLowerCase() === "yes") {
      if (!hasPending(chatId)) return send("❌ No pending approval \\(may have expired\\)\\.");
      await send("⚙️ _Executing\\.\\.\\._");
      const result = await executeApproved(chatId, send);
      if (result.message) return send(result.message);
      return;
    }

    // ── NO: cancel ──────────────────────────────────────────────
    if (text.toLowerCase() === "no") {
      clearPending(chatId);
      return send("❌ Cancelled\\.");
    }

    // ── Nightly suggestion quick-implement (1 / 2 / 3) ──────────
    if (/^[123]$/.test(text)) {
      const suggestions = Scheduler.getSuggestions();
      if (suggestions) {
        const suggestion = suggestions[parseInt(text) - 1];
        if (suggestion) {
          Scheduler.clearSuggestions();
          await send(`🔍 _Analyzing suggestion ${text}\\.\\.\\._`);
          const result = await runPipeline(chatId, suggestion);
          return send(result.message);
        }
      }
      // Fall through to general handling if no suggestions
    }

    // ── Slash commands ───────────────────────────────────────────
    if (text.startsWith("/")) {
      const handled = await handleCommand(text, chatId);
      if (handled !== null) return;
      return send("❓ Unknown command\\. Type /help");
    }

    // ── Website edit request ─────────────────────────────────────
    await send(`🔍 _Analyzing: "${text.slice(0, 60).replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&")}"\\.\\.\\._ `);
    const result = await runPipeline(chatId, text);
    if (!result.ok) {
      Hermes.remember(text, result.message, false);
    }
    return send(result.message);

  } catch (err) {
    log.error("handleMessage error:", err.message);
    Hermes.remember(text, err.message, false);
    Hindsight.record(text, err.message, [], false);
    return send(`❌ Error: ${err.message.slice(0, 400)}`);
  }
}

// ── Start ────────────────────────────────────────────────────────
async function startBot() {
  bot = new TelegramBot(BOT_TOKEN, { polling: true });

  // Inject send function into scheduler (avoids circular dep)
  setSendFn(send);

  bot.on("message", handleMessage);
  bot.on("polling_error", (e) => log.error("Polling error:", e.message));

  const me = await bot.getMe();
  log.info(`✅ Bot online: @${me.username}`);

  await send(
    `🤖 *Agent v5\\.0 Online*\n\n` +
    `✅ Approval flow \\+ 5min expiry\n` +
    `🔐 File backup \\+ rollback\n` +
    `🔁 Gemini retry \\+ rate limit\n` +
    `📦 Modular architecture\n` +
    `📸 Auto screenshot\n` +
    `🌙 AutoResearch at 02:00\n\n` +
    `Type /help to start`
  ).catch(() => {});
}

module.exports = { startBot };
