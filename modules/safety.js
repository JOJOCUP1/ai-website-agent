// modules/safety.js — Safety scanner + env validator + input sanitizer
const { log } = require("./logger");

// ── Env validation ───────────────────────────────────────────────
function validateEnv(required) {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    log.fatal(`Missing env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
}

// ── Command safety scanner ───────────────────────────────────────
const DANGEROUS_PATTERNS = [
  { re: /delete.*(all|every|entire|database|db)/i,  label: "Mass delete" },
  { re: /drop\s+(table|database)/i,                 label: "SQL drop" },
  { re: /rm\s+-rf/i,                                label: "rm -rf" },
  { re: /wipe\s+(all|everything|site)/i,            label: "Wipe command" },
  { re: /format\s+(disk|drive|c:)/i,                label: "Format disk" },
  { re: /\beval\s*\(/i,                             label: "eval() injection" },
  { re: /exec\s*\(/i,                               label: "exec() injection" },
  { re: /require\s*\(['"]\s*child_process/i,        label: "child_process injection" },
  { re: /process\.exit/i,                           label: "process.exit injection" },
];

function scanCommand(command) {
  for (const { re, label } of DANGEROUS_PATTERNS) {
    if (re.test(command)) {
      return { safe: false, reason: `🛑 Dangerous pattern detected: ${label}` };
    }
  }
  if (command.length > 1000) {
    return { safe: false, reason: "🛑 Command too long (max 1000 chars)" };
  }
  if (command.trim().length < 3) {
    return { safe: false, reason: "🛑 Command too short" };
  }
  return { safe: true };
}

// ── File content scanner (before writing) ───────────────────────
const DANGEROUS_CODE_PATTERNS = [
  /require\s*\(\s*['"]child_process['"]\s*\)/i,
  /exec\s*\(|execSync\s*\(/i,
  /fs\.unlinkSync|fs\.rmdirSync/i,
  /process\.env\b/i,
  /<script[^>]*src\s*=\s*["']https?:\/\/(?!cdnjs)/i, // external scripts (non-CDN)
];

function scanFileContent(filename, content) {
  // Only scan JS files strictly
  if (!filename.endsWith(".js")) return { safe: true };
  for (const re of DANGEROUS_CODE_PATTERNS) {
    if (re.test(content)) {
      return { safe: false, reason: `Suspicious pattern in ${filename}: ${re}` };
    }
  }
  return { safe: true };
}

// ── Sanitize text for Telegram Markdown ─────────────────────────
function sanitizeTelegramText(text) {
  return String(text)
    .replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&")
    .slice(0, 3800);
}

module.exports = { validateEnv, scanCommand, scanFileContent, sanitizeTelegramText };
