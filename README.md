# AI Website Agent v5.0

Telegram bot that edits your website using Gemini AI — with approval flow, backups, and auto-screenshots.
mate jojua 

## Quick Start

```bash
git clone <this-repo>
cd agent
npm install
npx playwright install chromium   # optional, for screenshots
cp .env.example .env
# fill in .env
node index.js
```


## Architecture

```
agent/
├── index.js              ← startup + env validation
├── bot.js                ← Telegram handler + all commands
├── pipeline.js           ← plan → approve → execute
├── modules/
│   ├── hermes.js         ← cross-session memory
│   ├── prism.js          ← knowledge graph + LightRAG search
│   ├── openspace.js      ← token optimization
│   ├── gsd.js            ← AI prompts (spec-first)
│   ├── safety.js         ← env validation + command scanner
│   ├── hindsight.js      ← outcome logging
│   ├── scheduler.js      ← cron tasks
│   └── logger.js         ← structured logging
├── integrations/
│   ├── gemini.js         ← Gemini 2.5 Flash + retry
│   ├── github.js         ← git push + backup + rollback
│   └── playwright.js     ← auto screenshots
├── data/                 ← runtime data (gitignored)
│   ├── hermes_memory.json
│   ├── prism_knowledge.json
│   ├── hindsight_log.json
│   ├── backups/
│   └── agent.log
└── .env                  ← secrets (gitignored)
```

## Security

- Only `TELEGRAM_CHAT_ID` can control the agent — all other chat IDs are rejected
- Approval required before any file change
- Approvals expire after 5 minutes
- File backups created before every write
- `/rollback` restores last backup
- Gemini output scanned before writing (blocks exec, child_process, etc.)
- Dangerous commands blocked (rm -rf, drop table, etc.)

## Commands

| Command | Description |
|---|---|
| _(any text)_ | Request a website change |
| `yes` / `no` | Approve or cancel pending plan |
| `/status` | System overview |
| `/memory` | Command history |
| `/files` | List website files |
| `/search [query]` | Find code |
| `/scan` | Rebuild knowledge graph |
| `/diff` | Last change diff |
| `/undo` | Revert last git commit |
| `/rollback` | Restore pre-deploy file backup |
| `/schedule` | Show scheduled tasks |
| `/screenshot` | Capture live site |
| `/stats` | Performance stats |
| `1` / `2` / `3` | Implement nightly suggestion |

## Scheduled Tasks

- **02:00** — AutoResearch: analyzes codebase, sends 3 improvement suggestions
- **09:00** — Daily knowledge graph scan
