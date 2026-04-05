// modules/gsd.js — GSD spec-first prompts (plan before execute)

function buildPlanPrompt(command, filesContext, memory, knowledge) {
  const filesList = Object.entries(filesContext)
    .map(([n, c]) => `### ${n}\n\`\`\`\n${c}\n\`\`\``)
    .join("\n\n");
  const components = (knowledge.components || []).slice(0, 15).join(", ") || "unknown";
  const fileNames  = Object.keys(knowledge.files || {}).join(", ") || "unknown";

  return `You are a senior web developer doing a code review BEFORE making changes.

## Agent Memory
${memory}

## Known Files
${fileNames}

## Known Components / IDs / Classes
${components}

## User Request
${command}

## Current File Contents
${filesList}

Reply ONLY with valid JSON (no markdown, no explanation):
{
  "understood": "what user wants in one sentence",
  "risk": "low|medium|high",
  "risk_reason": "why it could break, or 'none'",
  "plan": ["Step 1", "Step 2", "Step 3"],
  "files_to_change": ["index.html"],
  "files_to_leave_alone": ["admin.html"],
  "estimated_lines_changed": 10
}

Rules:
- Maximum 2 files to change
- Minimum changes only — surgical edits
- If the request is unclear or impossible, set risk to "high" and explain in risk_reason`;
}

function buildExecutePrompt(command, plan, filesContext, memory) {
  const filesList = Object.entries(filesContext)
    .map(([n, c]) => `### ${n}\n\`\`\`\n${c}\n\`\`\``)
    .join("\n\n");

  return `You are an expert web developer. Execute the approved plan precisely.

## Memory
${memory}

## Original Request
${command}

## Approved Plan
${plan.plan.join(" → ")}

## Files to Change (ONLY these)
${plan.files_to_change.join(", ")}

## Files to Leave Alone (DO NOT touch)
${plan.files_to_leave_alone.join(", ")}

## Current File Contents
${filesList}

Reply ONLY with valid JSON (no markdown, no explanation):
{
  "summary": "one sentence describing what changed",
  "changes": [
    {"file": "index.html", "content": "COMPLETE new file content here"}
  ]
}

Rules:
- Always return the COMPLETE file content, not just the changed section
- Only include files from files_to_change
- Do not add, remove, or rename files not in the approved list
- Do not inject scripts, iframes, or external resources not requested
- Keep existing structure — only change what is asked`;
}

function buildNightlyPrompt(knowledge) {
  const files      = Object.keys(knowledge.files || {}).join(", ");
  const components = (knowledge.components || []).slice(0, 15).join(", ");
  const fileDetails = Object.entries(knowledge.files || {})
    .map(([f, d]) => `${f}: ${d.lines} lines, hasNav=${d.hasNav}, hasForm=${d.hasForm}`)
    .join("\n");

  return `You are a web developer. Analyze this codebase and suggest 3 specific, actionable improvements.

Files: ${files}
Components: ${components}
Details:
${fileDetails}

Reply ONLY with valid JSON:
{"suggestions": ["improvement 1", "improvement 2", "improvement 3"]}

Make suggestions specific and implementable in one command each.`;
}

module.exports = { buildPlanPrompt, buildExecutePrompt, buildNightlyPrompt };
