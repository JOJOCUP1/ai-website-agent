// modules/hermes.js — Cross-session memory + AUTO-LEARN + user profiling
const fs   = require("fs");
const path = require("path");
const { log } = require("./logger");

const MEMORY_FILE = path.join(__dirname, "../data/hermes_memory.json");
const MAX_HISTORY = 50;
const MAX_SKILLS  = 30;

function load() {
  if (!fs.existsSync(MEMORY_FILE)) {
    return { history: [], skills: [], userProfile: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
  } catch (e) {
    log.warn("Hermes: corrupt memory file, resetting.", e.message);
    return { history: [], skills: [], userProfile: {} };
  }
}

function save(mem) {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2));
  } catch (e) {
    log.error("Hermes: failed to save memory.", e.message);
  }
}

function remember(command, summary, success) {
  const mem = load();

  mem.history.push({
    ts: new Date().toISOString(),
    command: command.slice(0, 120),
    summary: (summary || "").slice(0, 200),
    success,
  });
  if (mem.history.length > MAX_HISTORY) {
    mem.history = mem.history.slice(-MAX_HISTORY);
  }

  // AUTO-LEARN: track successful patterns as skills
  if (success) {
    const skill = command.toLowerCase().slice(0, 60);
    if (!mem.skills.includes(skill)) mem.skills.push(skill);
    if (mem.skills.length > MAX_SKILLS) mem.skills = mem.skills.slice(-MAX_SKILLS);
  }

  // User profile inference
  const kw = command.toLowerCase();
  if (kw.match(/color|design|style|theme|font/))    mem.userProfile.prefersDesign      = true;
  if (kw.match(/security|safe|auth|login/))         mem.userProfile.prefersSecurity    = true;
  if (kw.match(/mobile|responsive|tablet/))         mem.userProfile.prefersResponsive  = true;
  if (kw.match(/speed|performance|lighthouse/))     mem.userProfile.prefersPerformance = true;
  if (kw.match(/seo|meta|structured data/))         mem.userProfile.prefersSEO         = true;

  save(mem);
}

// CLAUDE MEM — compressed context for AI prompts
function getCompressedContext() {
  const mem = load();
  const recent = mem.history.slice(-5)
    .map((h) => `"${h.command.slice(0, 40)}" → ${h.success ? "✓" : "✗"}`)
    .join(" | ");
  const profile = Object.keys(mem.userProfile).join(", ") || "general";
  const skills  = mem.skills.length;
  return `Recent: ${recent || "none"} | Profile: ${profile} | Skills learned: ${skills}`;
}

function getHistory(n = 8) {
  return load().history.slice(-n);
}

function getStats() {
  const mem = load();
  return {
    totalCommands: mem.history.length,
    successRate: mem.history.length
      ? Math.round((mem.history.filter((h) => h.success).length / mem.history.length) * 100)
      : 0,
    skills: mem.skills.length,
    profile: mem.userProfile,
  };
}

module.exports = { remember, getCompressedContext, getHistory, getStats };
