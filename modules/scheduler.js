// modules/scheduler.js — n8n-MCP style cron tasks
const fs   = require("fs");
const path = require("path");
const { log }    = require("./logger");
const Prism      = require("./prism");
const { buildNightlyPrompt } = require("./gsd");

const SUGGESTIONS_FILE = path.join(__dirname, "../data/nightly_suggestions.json");
const WEBSITE_DIR      = process.env.WEBSITE_DIR;
const tasks            = new Map();

let sendFn = null; // injected by bot.js to avoid circular deps

function setSendFn(fn) {
  sendFn = fn;
}

function safeSend(msg) {
  if (sendFn) sendFn(msg).catch(() => {});
}

function scheduleAt(name, hour, minute, taskFn) {
  const tick = () => {
    const now  = new Date();
    const next = new Date();
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const ms = next - now;

    const timeout = setTimeout(async () => {
      log.info(`Scheduler: running "${name}"`);
      try {
        await taskFn();
      } catch (e) {
        log.error(`Scheduler: "${name}" failed:`, e.message);
      }
      tick(); // reschedule
    }, ms);

    tasks.set(name, { timeout, nextRun: next });
    log.info(`Scheduler: "${name}" scheduled for ${next.toLocaleTimeString()}`);
  };
  tick();
}

async function nightlyOptimization() {
  const { callGemini } = require("../integrations/gemini");
  const kg = Prism.scan(WEBSITE_DIR);
  const prompt = buildNightlyPrompt(kg);
  const result = await callGemini(prompt);

  if (!result?.suggestions?.length) {
    log.warn("Nightly: no suggestions returned");
    return;
  }

  fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(result.suggestions));

  safeSend(
    `🌙 *AutoResearch — Nightly Report*\n\n` +
    result.suggestions.map((s, i) => `${i + 1}\\. ${s}`).join("\n") +
    `\n\n_Reply 1, 2, or 3 to implement_`
  );
}

function initScheduler() {
  // AutoResearch at 02:00
  scheduleAt("nightly-research", 2, 0, nightlyOptimization);

  // Daily knowledge graph scan at 09:00
  scheduleAt("daily-scan", 9, 0, () => {
    Prism.scan(WEBSITE_DIR);
    safeSend("🗺 _Daily knowledge graph updated_");
  });
}

function getStatus() {
  return [...tasks.entries()].map(([name, t]) => ({
    name,
    nextRun: t.nextRun.toLocaleString(),
  }));
}

function getSuggestions() {
  if (!fs.existsSync(SUGGESTIONS_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, "utf8")); }
  catch { return null; }
}

function clearSuggestions() {
  try { fs.unlinkSync(SUGGESTIONS_FILE); } catch {}
}

module.exports = { initScheduler, setSendFn, getStatus, getSuggestions, clearSuggestions };
