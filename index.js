// ================================================================
// index.js — AI Website Agent v5.0 — Entry Point
// ================================================================
require("dotenv").config();
const { validateEnv } = require("./modules/safety");
const { startBot }    = require("./bot");
const { initScheduler } = require("./modules/scheduler");
const Prism           = require("./modules/prism");
const { log }         = require("./modules/logger");

// Validate all required env vars before anything staასა
validateEnv([
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "GEMINI_API_KEY",
  "WEBSITE_DIR",
]);

// WEBSITE_DIR must exist
const fs   = require("fs");
const WEBSITE_DIR = process.env.WEBSITE_DIR;
if (!fs.existsSync(WEBSITE_DIR)) {
  log.fatal(`WEBSITE_DIR not found: ${WEBSITE_DIR}`);
  process.exit(1);
}

// Global unhandled rejection guard
process.on("unhandledRejection", (reason) => {
  log.error("Unhandled rejection:", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  log.error("Uncaught exception:", err.message);
});

async function main() {
  log.info("🚀 Agent v5.0 starting...");

  // Initial knowledge scan
  Prism.scan(WEBSITE_DIR);

  // Start scheduler (nightly + daily tasks)
  initScheduler();

  // Start Telegram bot
  await startBot();
}

main().catch((e) => {
  log.fatal("Startup failed:", e.message);
  process.exit(1);
});
