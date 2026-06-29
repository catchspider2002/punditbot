# PunditBot — Cloudflare Deployment (as built)

**Track:** Consumer & Fan Experiences · **Subdomain:** `punditbot.<domain>`
**Spec:** `SPEC.md` · **Notes:** `README.md`

## Shape (as built)

**Workers webhook + Durable Object + D1 + Claude** — no Container, no polling mode. Telegram delivers updates to the Worker `/webhook`; a `MatchRoom` Durable Object per followed match polls TxLINE on a ~15s alarm and pushes pundit messages to subscribers via the Bot API. Subscriptions persist in D1 (not in-memory).

## Component mapping

| Spec component | Cloudflare (shipped) |
|---|---|
| `index.js` (bot + SSE) | Worker `/webhook` (commands + callbacks) + `MatchRoom` DO (live polling/push) |
| `txline.js` SSE | `src/txline.ts` polled by the DO (scores + odds) |
| `commentary.js` (Claude) | `src/commentary.ts` — pundit message + `/odds` one-liner, fallback |
| `telegram.js` | `src/telegram.ts` — sendMessage / answerCallbackQuery / inline keyboards |
| `subscriptions.js` (in-memory) | **D1** `subs` (survives restarts) |
| `matchCache.js` (for /recap) | **D1** `match_events` |
| webhook vs polling | webhook only; `GET /setwebhook?key=ADMIN_KEY` registers it |
| TTS voice notes | not implemented (text only) |

## Bindings (`wrangler.toml`, as shipped)

```toml
name = "punditbot"
main = "src/worker.ts"
compatibility_date = "2026-01-01"

[assets]
directory = "./public"
binding = "ASSETS"

[[durable_objects.bindings]]
name = "MATCH_ROOM"
class_name = "MatchRoom"

[[migrations]]
tag = "v1"
new_classes = ["MatchRoom"]

[[d1_databases]]
binding = "DB"
database_name = "punditbot"
database_id = "REPLACE_WITH_D1_ID"
```

Secrets: `TELEGRAM_BOT_TOKEN`, `TXLINE_API_KEY` (required); `ANTHROPIC_API_KEY` (recommended); `WEBHOOK_SECRET`, `ADMIN_KEY` (recommended).

## Deploy + register webhook

```bash
npm install && wrangler login
wrangler d1 create punditbot && npm run db:init:remote
wrangler secret put TELEGRAM_BOT_TOKEN   # from @BotFather
wrangler secret put TXLINE_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put WEBHOOK_SECRET
wrangler secret put ADMIN_KEY
npm run deploy
# one-time: open https://punditbot.<sub>.workers.dev/setwebhook?key=<ADMIN_KEY>
```

## Notes

- The DO polls only while a match has followers and stops at full time (cost-safe).
- This is the project's Solana sign-up gap — add a wallet-link step to satisfy the requirement.
