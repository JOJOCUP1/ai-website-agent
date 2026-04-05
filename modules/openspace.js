// modules/openspace.js — Token optimization (OpenSpace ~46% cost reduction)
const fs   = require("fs");
const path = require("path");

const ALLOWED_EXTS    = [".html", ".css", ".js"];
const MAX_FILE_CHARS  = 8000;
const MAX_TOTAL_CHARS = 16000;
const MAX_FILES       = 3;

// Keyword → relevant file types mapping
const RELEVANCE_MAP = [
  { re: /color|style|font|background|css|design|look|theme|gradient|border/i, exts: [".css", ".html"] },
  { re: /script|function|click|button|form|submit|fetch|api|event|javascript/i, exts: [".js", ".html"] },
  { re: /nav|header|footer|hero|section|layout|grid|flex|container/i,          exts: [".html"] },
  { re: /seo|meta|title|description|og:|canonical/i,                            exts: [".html"] },
];

function readSmart(dir, command) {
  let allFiles;
  try {
    allFiles = fs.readdirSync(dir).filter((f) => ALLOWED_EXTS.includes(path.extname(f)));
  } catch {
    return {};
  }

  // Determine relevant file types
  let relevantExts = ALLOWED_EXTS;
  for (const { re, exts } of RELEVANCE_MAP) {
    if (re.test(command)) {
      relevantExts = exts;
      break;
    }
  }

  const relevant = allFiles.filter((f) => relevantExts.includes(path.extname(f)));
  const toRead   = (relevant.length > 0 ? relevant : allFiles).slice(0, MAX_FILES);

  const context = {};
  let total = 0;

  for (const file of toRead) {
    try {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      context[file] = content.slice(0, MAX_FILE_CHARS);
      total += context[file].length;
      if (total >= MAX_TOTAL_CHARS) break;
    } catch {}
  }

  return context;
}

module.exports = { readSmart };
