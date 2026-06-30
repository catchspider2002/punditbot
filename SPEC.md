# PunditBot - AI Pundit Telegram Bot
## Build Spec for Claude Code

---

## What we're building

A Telegram bot that follows every World Cup match live and sends a message every time something significant happens - a goal, red card, big odds shift - explaining what just happened and what the market thinks now. Optional text-to-speech voice notes for each event. Zero setup for end users: find the bot, type /start, pick your match, done.

Submitted to the **Superteam × TxODDS World Cup Hackathon** under the **Fan Experiences** track.

**Hackathon deadline:** July 19, 2026 (23:59 UTC)  
**Required:** deployed bot (live, not just local), demo video, public GitHub repo, Telegram bot link for judges to test

---

## Architecture overview

```
TxLINE SSE Stream
       │
       ▼
Node.js Backend (Express)
  ├── Ingests SSE events from TxLINE
  ├── Filters for significant events
  ├── Calls Claude API → generates pundit commentary
  ├── (Optional) Calls TTS API → generates voice note .ogg
  └── Sends message/voice note via Telegram Bot API
       │
       ▼
Telegram Bot (@PunditBotWC or similar)
  ├── /start - welcome + match list
  ├── /matches - list live and upcoming fixtures
  ├── /follow MATCH_ID - subscribe to a match
  ├── /unfollow - stop notifications
  ├── /odds MATCH_ID - current odds snapshot
  └── /recap MATCH_ID - summary of events so far
```

---

## Project structure

```
punditbot/
├── index.js                  # Entry point - starts SSE listener + Telegram bot
├── txline.js                 # TxLINE SSE client + event filter
├── commentary.js             # Claude API → pundit message generator
├── tts.js                    # (Optional) Text-to-speech → .ogg voice note
├── telegram.js               # Telegram Bot API wrapper
├── subscriptions.js          # In-memory store: matchId → Set<chatId>
├── matchCache.js             # Caches live match state + event history
├── .env.example
├── package.json
└── README.md
```

---

## Bot commands

### `/start`
Welcome message:

```
Welcome to PunditBot - your AI football pundit for the 2026 World Cup.

I send you a message every time something significant happens in a match: goals, red cards, big odds swings. With a proper explanation of what it means.

Use /matches to see what's on today.
```

### `/matches`
Fetches upcoming and live fixtures from TxLINE. Returns a formatted list:

```
Today's matches:

🟢 LIVE  Brazil vs France (67') - Group A
⚪ 18:00  Argentina vs Germany - Group B
⚪ 21:00  England vs Spain - Group C

Reply /follow brazil-france to get live updates.
```

Use inline keyboard buttons (Telegram `InlineKeyboardMarkup`) so users can tap to follow rather than type the command.

### `/follow MATCH_ID`
- Adds the user's `chatId` to the subscription set for that match
- Immediately sends the current match state (score, minute, last event)
- Confirms: "You're following Brazil vs France. I'll message you when something happens."
- If match hasn't started yet: "Match starts at 18:00 UTC. I'll message you at kickoff."

### `/unfollow`
- Shows list of matches the user is currently following with inline buttons to unfollow each
- Removes them from the subscription set

### `/odds MATCH_ID`
Returns a snapshot of current TxLINE odds:

```
Brazil vs France - 67'

Brazil win:  1.82  (was 1.45 before Casemiro's red card)
Draw:        3.50
France win:  2.20

Market implies France have a 45% chance to get back into this.
```

The final line is Claude-generated - a one-sentence plain English interpretation of the odds.

### `/recap MATCH_ID`
Returns a bulleted summary of all significant events so far in the match, pulled from the in-memory event cache. Each bullet is the stored Claude commentary line for that event.

---

## Event filtering - what triggers a message

Only send messages for these events (same threshold logic as PitchPulse):

| Event | Trigger condition |
|---|---|
| Kickoff | Always |
| Goal | Always |
| Own goal | Always |
| Red card | Always |
| Penalty awarded | Always |
| Penalty missed | Always |
| VAR decision | Always |
| Half time | Always |
| Full time | Always |
| Odds shift | Only if any outcome moves ≥ 8 percentage points |
| Injury | Only if to a key player (goalkeeper or if TxLINE flags as significant) |

Do NOT send messages for: corners, throw-ins, regular fouls, substitutions under 70 minutes, minor odds ticks.

---

## Commentary generator (`commentary.js`)

Call Claude API for every filtered event. Use this system prompt:

```
You are a sharp, opinionated football pundit covering the 2026 World Cup on Telegram.

When given a match event and the current match context, write a short Telegram message explaining:
1. What just happened (one vivid sentence)
2. What it means for the match (one sentence)
3. What the market thinks now, in plain English (one sentence - only if odds data is provided)

Rules:
- Total message: maximum 3 sentences, maximum 60 words
- Write like a knowledgeable fan texting a group chat, not a press release
- Be direct and opinionated - it's fine to say "this looks over" or "France are back in this"
- Use the player names and team names from the event data
- For odds shifts with no other event: lead with what the market is doing and why
- For half time / full time: give a one-paragraph match verdict (up to 80 words)
- Output only the message text, no labels, no markdown formatting
```

User message (JSON):
```json
{
  "event": { ...raw TxLINE event object... },
  "matchContext": {
    "homeTeam": "Brazil",
    "awayTeam": "France",
    "score": "2-1",
    "minute": 64,
    "recentEvents": ["Goal - Vinicius 34'", "Goal - Rodrygo 51'", "Goal - Mbappé 58'"]
  },
  "odds": {
    "home": 1.82,
    "draw": 3.50,
    "away": 2.20,
    "previousHome": 1.45
  }
}
```

Use `claude-sonnet-4-6`, `max_tokens: 150`.

Cache the generated commentary in `matchCache.js` for use in `/recap`.

---

## TTS voice notes (`tts.js`) - optional but high-impact for demo

If implementing TTS:

- Use **ElevenLabs API** (has a free tier) or **OpenAI TTS** (`tts-1` model, `onyx` voice)
- Input: the Claude-generated commentary text
- Output: `.ogg` audio file (Telegram requires Ogg Vorbis for voice notes)
- Convert if needed using `ffmpeg` (available on most deployment platforms): `mp3 → ogg`
- Send as `sendVoice` via Telegram Bot API instead of `sendMessage`
- Gate behind a user preference: `/voice on` / `/voice off` (default off - saves API costs)

If TTS adds too much latency or cost, ship text-only first and add voice as a stretch goal.

---

## Telegram integration (`telegram.js`)

Use the `node-telegram-bot-api` npm package.

Key Telegram API calls used:
- `bot.sendMessage(chatId, text)` - standard text message
- `bot.sendVoice(chatId, audioBuffer)` - voice note (if TTS enabled)
- `bot.sendMessage(chatId, text, { reply_markup: inlineKeyboard })` - buttons for match selection
- `bot.on('callback_query', handler)` - handle inline button taps

Telegram message formatting: use plain text, not Markdown. Keep it clean. The only formatting needed is line breaks between the three sentences.

---

## Subscriptions store (`subscriptions.js`)

Simple in-memory Map - no database needed for hackathon scope:

```js
// matchId → Set of chatIds
const subscriptions = new Map()

function subscribe(matchId, chatId) { ... }
function unsubscribe(matchId, chatId) { ... }
function getSubscribers(matchId) { ... }
function getUserSubscriptions(chatId) { ... }
```

On restart, subscriptions are lost - acceptable for a hackathon. Note this in the README.

---

## Match cache (`matchCache.js`)

Stores live state per match:

```js
{
  matchId: {
    homeTeam, awayTeam,
    score: { home: 2, away: 1 },
    minute: 67,
    status: 'live',       // upcoming | live | halftime | finished
    events: [             // array of { minute, type, commentary, timestamp }
      { minute: 34, type: 'goal', commentary: 'Vinicius...' },
      ...
    ],
    currentOdds: { home: 1.82, draw: 3.50, away: 2.20 }
  }
}
```

Updated on every TxLINE event. Used by `/recap` and `/odds` commands.

---

## Deployment

- **Platform:** Railway or Fly.io - needs a persistent long-running process (not serverless)
- The bot runs as a single Node.js process with:
  - Telegram polling or webhook (webhook preferred for production - set via `setWebhook`)
  - TxLINE SSE connection open continuously
- Set `WEBHOOK_URL` in env to your deployed domain if using webhooks
- For hackathon, polling mode is simpler: `bot = new TelegramBot(token, { polling: true })`

---

## Environment variables (`.env`)

```
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TXLINE_API_KEY=your_txline_key
TXLINE_SSE_URL=https://txline.txodds.com/stream
ANTHROPIC_API_KEY=your_anthropic_key
ELEVENLABS_API_KEY=your_elevenlabs_key   # optional, only if doing TTS
PORT=3001
```

---

## Demo video plan (max 5 minutes)

1. **0:00-0:30** - Open Telegram, find @PunditBotWC, type /start. Show the welcome message and /matches list.
2. **0:30-1:00** - Tap to follow a live match. Show the current match state message arriving instantly.
3. **1:00-2:30** - Live event fires (goal or red card). Show the TxLINE event in the backend terminal, the Claude API call, and the Telegram message arriving on the phone within 3 seconds. Read it out - it should sound genuinely good.
4. **2:30-3:00** - (If TTS enabled) Show a voice note arriving in Telegram. Play it. This is the standout demo moment.
5. **3:00-3:30** - Type /recap. Show the full match summary built from cached events.
6. **3:30-4:00** - Type /odds. Show the formatted odds with the plain English interpretation.
7. **4:00-4:30** - Show a second phone following the same match - same events, same commentary arriving simultaneously.
8. **4:30-5:00** - Wrap: "Every World Cup match. Every significant moment. In your pocket. Automatically."

---

## Submission checklist

- [ ] Bot live on Telegram and publicly findable (share the @username in submission)
- [ ] All commands working: /start, /matches, /follow, /unfollow, /odds, /recap
- [ ] Live event messages sending within ~5 seconds of TxLINE event
- [ ] (Stretch) Voice notes working via /voice on
- [ ] Backend deployed on Railway or Fly.io
- [ ] GitHub repo public with README including bot link
- [ ] Demo video uploaded (Loom or YouTube)
- [ ] TxLINE endpoints used listed in submission form
- [ ] API feedback prepared

---

## TxLINE resources

- Quickstart: https://txline.txodds.com/documentation/quickstart
- World Cup docs: https://txline.txodds.com/documentation/worldcup
- Support: Discord and Telegram
- Data fees waived until July 19, 2026

---

## Key decisions / notes for Claude Code

- **Create the Telegram bot first** via @BotFather before writing any code - you need the token to test anything
- **Use polling mode** during development (`{ polling: true }`), switch to webhooks only if deployment requires it
- **Mock the TxLINE stream** during development with a `mockStream.js` that fires fake events every 30 seconds - don't wait for a live match to test the bot
- **Rate limit Claude calls** - if two events fire within 2 seconds of each other (e.g. goal + odds shift), queue them and process with a 1-second gap to avoid hammering the API
- **Keep the commentary cache in memory** - no database needed. If the process restarts, the bot loses history but resumes normally on the next event
- **Test the 3-second delivery target** - measure time from TxLINE event received to Telegram message delivered. If it's consistently over 5 seconds, the Claude API call is the bottleneck; consider caching a pool of pre-generated commentary templates as fallback
- **Voice note format:** Telegram requires `.ogg` (Opus codec). ElevenLabs outputs `.mp3` by default - use `fluent-ffmpeg` to convert. Check if ffmpeg is available on your deployment platform
- The `/follow` inline keyboard buttons are important for the demo - typing match IDs is clunky, tapping a button is slick
