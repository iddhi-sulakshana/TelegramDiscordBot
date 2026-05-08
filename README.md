# Telegram → Discord Bridge

NestJS bot (Bun runtime) that forwards Telegram group messages to a Discord text channel via webhook.

## Setup

```bash
bun install
cp .env.example .env
# fill TELEGRAM_BOT_TOKEN + DISCORD_WEBHOOK_URL
bun run start:dev
```

## How it works

- Telegraf listens to all messages in groups the bot is added to.
- Each message → Discord webhook POST as an embed with sender, chat title, timestamp.
- Photos resolved to public Telegram CDN URL and rendered as embed image.
- 429 rate-limit handled via `retry-after`.

## Env

| Var | Required | Notes |
|-----|----------|-------|
| `TELEGRAM_BOT_TOKEN` | yes | from `@BotFather` |
| `DISCORD_WEBHOOK_URL` | yes | Channel → Integrations → Webhooks |
| `ALLOWED_CHAT_ID` | no | restrict to one group (numeric, negative for groups) |
| `INCLUDE_METADATA` | no | `false` to drop sender/chat fields |

## Telegram bot setup (BotFather)

1. `/newbot` → bot name + username (see persona below).
2. **Disable privacy mode** so bot reads all group messages: `/setprivacy` → select bot → **Disable**. Without this, bot only sees commands and replies.
3. `/setdescription` and `/setabouttext` (see persona below).
4. `/setuserpic` → upload generated avatar.
5. Add bot to target group as **member** (admin not required if privacy disabled).

## Discord webhook

Channel settings → Integrations → Webhooks → New Webhook → Copy URL → paste into `.env`.

## Bot persona — low-suspicion options

Goal: looks like internal devops tooling, not a "data harvesting bot." Pick one set.

### Option A — Engineering archive

- **Name:** `Team Notes Sync`
- **Username:** `@TeamNotesSync_bot`
- **About (120 char):** `Mirrors discussion threads to our internal engineering archive. Read-only — keeps the eng team in sync.`
- **Description (long):** `Internal tool used by our engineering team to mirror group conversations into our shared notes workspace, so devs who are heads-down on tickets do not miss decisions made in chat. Read-only forwarder. Maintained by the platform team.`
- **Avatar prompt:** *flat minimalist icon, clipboard with a sync arrow, soft slate-blue background, rounded square, no text*

### Option B — Build / status mirror

- **Name:** `Project Mirror`
- **Username:** `@ProjectMirror_bot`
- **About:** `Project chat mirror for distributed engineering team. Forwards messages to our shared workspace.`
- **Description:** `Lightweight relay our team uses so engineers in different timezones see the same context. No automation, no replies — just a one-way mirror to our internal channel.`
- **Avatar prompt:** *two overlapping rounded squares with a thin connecting line, navy + cyan, flat design, no text*

### Option C — Standup digest (most innocuous)

- **Name:** `Standup Sync`
- **Username:** `@StandupSync_bot`
- **About:** `Helps the eng team capture standup-relevant chatter into our shared log. Read-only.`
- **Description:** `Used by our software engineering team to bridge group discussion into the team log we review during standup. No commands, no replies — silent forwarder.`
- **Avatar prompt:** *clean checkmark inside a speech bubble, muted green, flat, rounded square 512x512, no text*

### Tips that lower suspicion further

- Username **must** end in `bot` (Telegram requirement) — keep it boring + utility-flavored, never "spy / track / monitor / scrape."
- Use a real-looking team handle (`TeamNotes`, `EngArchive`, `Standup`) — avoid random alphanumerics.
- Set commands list to empty (`/setcommands` → blank) so it looks passive.
- Avoid admin permissions; member with privacy disabled is enough.
- Have one of your team mention "we use this internally so the timezone-shifted folks don't miss context" when adding it.

## Generating the avatar

Any image generator works. Recommended: **Bing Image Creator** or **OpenAI gpt-image-1**, prompt = the avatar prompt from the chosen option above + `"512x512, transparent or solid background, no text, app-icon style"`. Telegram avatar must be square ≤ 512x512 PNG/JPG.

## Project layout

```
src/
  main.ts                  bootstrap
  app.module.ts            wires Discord + Telegram modules
  discord/
    discord.module.ts
    discord.service.ts     webhook POST + 429 backoff
  telegram/
    telegram.module.ts
    telegram.service.ts    Telegraf bot, on('message') -> forward
```
