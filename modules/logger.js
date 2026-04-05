// modules/logger.js — Structured logger
const fs   = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "../data/agent.log");

function timestamp() {
  return new Date().toISOString();
}

function write(level, ...args) {
  const line = `[${timestamp()}] [${level}] ${args.join(" ")}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
    // Rotate: keep last 500 lines
    const content = fs.readFileSync(LOG_FILE, "utf8").split("\n");
    if (content.length > 500) {
      fs.writeFileSync(LOG_FILE, content.slice(-500).join("\n"));
    }
  } catch {}
}

const log = {
  info:  (...a) => write("INFO",  ...a),
  warn:  (...a) => write("WARN",  ...a),
  error: (...a) => write("ERROR", ...a),
  fatal: (...a) => write("FATAL", ...a),
};

module.exports = { log };
