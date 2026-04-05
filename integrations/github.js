// integrations/github.js — Git operations with backup + rollback
const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");
const { log } = require("../modules/logger");

const WEBSITE_DIR   = process.env.WEBSITE_DIR;
const BACKUP_DIR    = path.join(__dirname, "../data/backups");
const MAX_BACKUPS   = 10;

// ── Backup ───────────────────────────────────────────────────────
function backupFiles(files) {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const ts     = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = { ts, files: {} };

  for (const file of files) {
    const full = path.join(WEBSITE_DIR, file);
    if (fs.existsSync(full)) {
      backup.files[file] = fs.readFileSync(full, "utf8");
    }
  }

  const backupFile = path.join(BACKUP_DIR, `backup_${ts}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));

  // Prune old backups
  const all = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("backup_"))
    .sort();
  if (all.length > MAX_BACKUPS) {
    all.slice(0, all.length - MAX_BACKUPS).forEach((f) =>
      fs.unlinkSync(path.join(BACKUP_DIR, f))
    );
  }

  log.info(`Backup created: ${backupFile}`);
  return backupFile;
}

// ── Restore last backup ──────────────────────────────────────────
function restoreLastBackup() {
  if (!fs.existsSync(BACKUP_DIR)) throw new Error("No backups found");

  const all = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("backup_"))
    .sort();
  if (!all.length) throw new Error("No backups found");

  const latest  = all[all.length - 1];
  const backup  = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, latest), "utf8"));
  const restored = [];

  for (const [file, content] of Object.entries(backup.files)) {
    fs.writeFileSync(path.join(WEBSITE_DIR, file), content, "utf8");
    restored.push(file);
  }

  log.info(`Restored backup: ${latest} — files: ${restored.join(", ")}`);
  return { backupTs: backup.ts, files: restored };
}

// ── Git push ─────────────────────────────────────────────────────
function gitPush(message) {
  try {
    execSync(
      `cd "${WEBSITE_DIR}" && git add -A && git commit -m "${message.replace(/"/g, "'")}" && git push`,
      { stdio: "pipe", timeout: 30_000 }
    );
    log.info(`Git push: ${message}`);
    return true;
  } catch (e) {
    const stderr = e.stderr?.toString() || e.message;
    if (stderr.includes("nothing to commit")) {
      log.info("Git: nothing to commit");
      return true;
    }
    throw new Error(`Git push failed: ${stderr.slice(0, 300)}`);
  }
}

// ── Git undo (revert last commit) ────────────────────────────────
function gitUndo() {
  execSync(
    `cd "${WEBSITE_DIR}" && git revert HEAD --no-edit && git push`,
    { stdio: "pipe", timeout: 30_000 }
  );
  log.info("Git: reverted last commit");
}

// ── Git diff (last change preview) ───────────────────────────────
function gitDiff() {
  try {
    const diff = execSync(
      `cd "${WEBSITE_DIR}" && git diff HEAD~1 HEAD --stat`,
      { stdio: "pipe", timeout: 10_000 }
    ).toString();
    return diff.trim() || "No diff available";
  } catch {
    return "No diff available (no commits yet)";
  }
}

module.exports = { backupFiles, restoreLastBackup, gitPush, gitUndo, gitDiff };
