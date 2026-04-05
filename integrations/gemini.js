// integrations/gemini.js — Gemini 2.5 Flash with retry + rate limiting
const { log } = require("../modules/logger");

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL      = "gemini-2.5-flash";
const API_URL    = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;

// Simple in-memory rate limiter: max 5 requests per minute
const requestLog = [];
const MAX_RPM    = 5;

function checkRateLimit() {
  const now  = Date.now();
  const min  = now - 60_000;
  const recent = requestLog.filter((t) => t > min);
  requestLog.length = 0;
  requestLog.push(...recent);
  if (recent.length >= MAX_RPM) {
    const waitMs = 60_000 - (now - recent[0]);
    throw new Error(`Rate limit: please wait ${Math.ceil(waitMs / 1000)}s before next request`);
  }
  requestLog.push(now);
}

async function callGemini(prompt, retries = 3) {
  checkRateLimit();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature:     0.2,
            maxOutputTokens: 65536,
          },
        }),
      });

      if (!res.ok) {
        const errText = (await res.text()).slice(0, 300);
        // 429 = quota exceeded — wait longer
        if (res.status === 429) {
          const wait = attempt * 15_000;
          log.warn(`Gemini 429, waiting ${wait / 1000}s (attempt ${attempt}/${retries})`);
          await sleep(wait);
          continue;
        }
        throw new Error(`Gemini HTTP ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!raw) throw new Error("Gemini returned empty response");

      // Strip markdown code fences if present
      const clean = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/,      "")
        .replace(/\s*```$/,      "")
        .trim();

      try {
        return JSON.parse(clean);
      } catch {
        // If it still fails, try to extract JSON from within the text
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) {
          try { return JSON.parse(match[0]); } catch {}
        }
        throw new Error(`Gemini non-JSON response: ${raw.slice(0, 200)}`);
      }
    } catch (e) {
      if (attempt === retries) throw e;
      const wait = attempt * 5_000; // 5s, 10s backoff
      log.warn(`Gemini error (attempt ${attempt}/${retries}): ${e.message} — retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { callGemini };
