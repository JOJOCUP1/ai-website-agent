// modules/prism.js — Knowledge graph (Prism MCP) + LightRAG search
const fs   = require("fs");
const path = require("path");
const { log } = require("./logger");

const KNOWLEDGE_FILE = path.join(__dirname, "../data/prism_knowledge.json");
const ALLOWED_EXTS   = [".html", ".css", ".js"];

function load() {
  if (!fs.existsSync(KNOWLEDGE_FILE)) {
    return { files: {}, components: [], lastScan: null };
  }
  try {
    return JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, "utf8"));
  } catch (e) {
    log.warn("Prism: corrupt knowledge file, resetting.", e.message);
    return { files: {}, components: [], lastScan: null };
  }
}

function save(kg) {
  try {
    fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(kg, null, 2));
  } catch (e) {
    log.error("Prism: failed to save knowledge graph.", e.message);
  }
}

function scan(dir) {
  const kg = { files: {}, components: [], lastScan: new Date().toISOString() };

  let dirFiles;
  try {
    dirFiles = fs.readdirSync(dir).filter((f) => ALLOWED_EXTS.includes(path.extname(f)));
  } catch (e) {
    log.error("Prism: cannot read WEBSITE_DIR.", e.message);
    return load();
  }

  for (const file of dirFiles) {
    try {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      const lines   = content.split("\n");

      kg.files[file] = {
        size:      content.length,
        lines:     lines.length,
        hasNav:    content.includes("<nav"),
        hasForm:   content.includes("<form"),
        hasScript: content.includes("<script"),
        hasMeta:   content.includes("<meta"),
        preview:   content.slice(0, 300).replace(/\n+/g, " "),
      };

      // Extract IDs and first class of each element
      const ids     = [...content.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
      const classes = [...content.matchAll(/class="([^"]+)"/g)].map((m) => m[1].split(" ")[0]);
      kg.components.push(...ids.slice(0, 8), ...classes.slice(0, 8));
    } catch (e) {
      log.warn(`Prism: cannot read ${file}`, e.message);
    }
  }

  kg.components = [...new Set(kg.components)].filter(Boolean).slice(0, 40);
  save(kg);
  log.info(`Prism: scanned ${dirFiles.length} files, ${kg.components.length} components`);
  return kg;
}

// LIGHTRAG — smart keyword search across codebase
function search(query, dir) {
  const results = [];
  let dirFiles;
  try {
    dirFiles = fs.readdirSync(dir).filter((f) => ALLOWED_EXTS.includes(path.extname(f)));
  } catch {
    return results;
  }

  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);

  for (const file of dirFiles) {
    try {
      const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        const lower = lines[i].toLowerCase();
        if (keywords.some((k) => lower.includes(k))) {
          results.push({
            file,
            line:    i + 1,
            content: lines[i].trim().slice(0, 120),
          });
          if (results.length >= 8) return results;
        }
      }
    } catch {}
  }
  return results;
}

module.exports = { scan, search, load };
