// modules/hindsight.js — Outcome logging for long-term learning
const fs   = require("fs");
const path = require("path");
const { log } = require("./logger");

const LOG_FILE  = path.join(__dirname, "../data/hindsight_log.json");
const MAX_ITEMS = 100;

function record(command, summary, files, success, durationMs = 0) {
  let items = [];
  if (fs.existsSync(LOG_FILE)) {
    try { items = JSON.parse(fs.readFileSync(LOG_FILE, "utf8")); } catch {}
  }

  items.push({
    ts:         new Date().toISOString(),
    command:    command.slice(0, 120),
    summary:    (summary || "").slice(0, 200),
    files:      Array.isArray(files) ? files : [],
    success,
    durationMs,
  });

  if (items.length > MAX_ITEMS) items = items.slice(-MAX_ITEMS);

  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(items, null, 2));
  } catch (e) {
    log.error("Hindsight: failed to write log.", e.message);
  }
}

function getStats() {
  if (!fs.existsSync(LOG_FILE)) return { total: 0, success: 0, fail: 0, avgMs: 0 };
  try {
    const items  = JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
    const success = items.filter((i) => i.success).length;
    const avgMs   = items.length
      ? Math.round(items.reduce((a, i) => a + (i.durationMs || 0), 0) / items.length)
      : 0;
    return { total: items.length, success, fail: items.length - success, avgMs };
  } catch {
    return { total: 0, success: 0, fail: 0, avgMs: 0 };
  }
}

module.exports = { record, getStats };
