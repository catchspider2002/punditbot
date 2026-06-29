# PunditBot — Submission Checklist

Track: **Consumer & Fan Experiences** (Superteam × TxODDS World Cup Hackathon)
Repo: https://github.com/catchspider2002/punditbot · Bot: _add @username_

## ✅ Done

- [x] Telegram webhook worker: /start /matches /follow /unfollow /odds /recap + inline callbacks
- [x] MatchRoom DO: ~15s scores/odds poll, event detect, Claude pundit message, push to subscribers (no Container)
- [x] Subscriptions + recap cache in D1 (persist across restarts)
- [x] `/setwebhook` registration route (gated by ADMIN_KEY)
- [x] Landing page + commands list
- [x] D1 schema (subs, match_events, kv); DO + assets config

## ⏳ Before submitting

- [ ] **Create the bot** with @BotFather → set `TELEGRAM_BOT_TOKEN`
- [ ] **Deploy**: create D1 + `db:init:remote`, set secrets (TELEGRAM_BOT_TOKEN, TXLINE_API_KEY, ANTHROPIC_API_KEY, WEBHOOK_SECRET, ADMIN_KEY), `npm run deploy`
- [ ] **Register webhook**: open `/setwebhook?key=<ADMIN_KEY>` once
- [ ] **Test**: `/start` → `/matches` → follow → confirm a live message arrives
- [ ] **Add bot @username** to README + `public/index.html` link + submission form
- [ ] **Record demo video** (≤5 min): follow a match on a phone, show a live pundit message + `/odds` + `/recap`
- [ ] **Push final code to GitHub** — verify `.dev.vars` is NOT committed
- [ ] **Fill submission form**: bot link, GitHub URL, video URL, TxLINE endpoints used, API feedback

## 💡 Optional polish / known limitations

- [ ] **Solana sign-up step** (this project's gap) — a small wallet-link page tied to the chat
- [ ] TTS voice notes (`/voice on`) via ElevenLabs/OpenAI + R2 (spec stretch goal)
- [ ] Richer events (player names/minutes) from the scores action feed
- [ ] Optional public channel broadcast in addition to per-user follows
