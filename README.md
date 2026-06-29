# PunditBot — AI Pundit Telegram Bot

A Telegram bot that follows World Cup matches live and messages you a sharp pundit take the moment something significant happens — goals, red cards, big moments — plus on-demand odds and recaps. Submitted to the Superteam × TxODDS World Cup Hackathon — Consumer & Fan Experiences track.

**Stack:** Cloudflare Workers (Telegram webhook) + **Durable Objects** (live polling + push) + D1 + Claude. No Container.

- **Bot:** _add your @username after BotFather setup_
- **GitHub:** https://github.com/catchspider2002/punditbot
- **Demo video:** _add link_
- **TxLINE endpoints used:** `POST /auth/guest/start`, `GET /api/fixtures/snapshot`, `GET /api/scores/snapshot/{fixtureId}`, `GET /api/odds/snapshot/{fixtureId}`

## Commands

`/start` · `/matches` (tap to follow) · `/follow <id>` · `/unfollow` · `/odds <id>` · `/recap <id>`

## How it works

- **Worker webhook** (`src/worker.ts`): receives Telegram updates, handles commands + inline-button callbacks. Subscriptions live in **D1** (survive restarts).
- **MatchRoom Durable Object** (`src/matchRoom.ts`): one per followed match. A ~15s alarm polls TxLINE scores + odds, detects events, writes a **Claude** pundit message (`claude-sonnet-4-6`, deterministic fallback), caches it for `/recap`, and pushes it to every subscriber via the Telegram Bot API. Stops when nobody is following or at full time.

## Setup & deploy

1. **Create the bot** with [@BotFather](https://t.me/BotFather) → copy the token.
2. Deploy:
   ```bash
   npm install
   wrangler login
   wrangler d1 create punditbot            # paste id into wrangler.toml
   npm run db:init:remote
   wrangler secret put TELEGRAM_BOT_TOKEN   # from BotFather
   wrangler secret put TXLINE_API_KEY
   wrangler secret put ANTHROPIC_API_KEY    # optional; fallback without it
   wrangler secret put WEBHOOK_SECRET        # any random string
   wrangler secret put ADMIN_KEY             # any random string
   npm run deploy
   ```
3. **Register the webhook** (one-time): open
   `https://punditbot.<sub>.workers.dev/setwebhook?key=<ADMIN_KEY>`
   — it calls Telegram `setWebhook` to point at `/webhook` with your secret.
4. Message your bot `/start`. Update `public/index.html` and this README with the bot @username.

## Demo

- `/start` → `/matches` → tap a match → it confirms you're following.
- Trigger an event during a live match (or generally, once an in-play match is followed) and a pundit message arrives within ~15s. `/odds <id>` and `/recap <id>` work any time.

## Notes / limitations (hackathon scope)

- Webhook mode (Workers can't long-poll). The Durable Object polls TxLINE only while a match has followers, and stops at full time — cost-safe.
- Events from goal/card counts + phase; messages are moment-based (no player names in the snapshot).
- Subscriptions persist in D1; TTS voice notes from the spec are not implemented (text only).
- This bot is the project's Solana sign-up gap — add a wallet-link step (e.g. a small web page) to fully satisfy the requirement.
