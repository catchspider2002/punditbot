// PunditBot - Claude pundit messages. Deterministic fallbacks if no key.
const EVENT_SYSTEM = `You are a sharp, opinionated football pundit covering the 2026 World Cup on Telegram.
When given a match event and context, write a short Telegram message:
1. What just happened (one vivid sentence).
2. What it means for the match (one sentence).
3. What the market thinks now, in plain English (one sentence - only if odds data is provided).

Rules:
- Total message: max 3 sentences, max 60 words.
- Write like a knowledgeable fan texting a group chat, not a press release.
- Be direct and opinionated.
- Output only the message text, no labels, no markdown.`;

export interface EventCtx { type: string; home: string; away: string; score: string; phase: string; odds?: { home: number; draw: number; away: number }; }

export async function punditMessage(apiKey: string | undefined, ctx: EventCtx): Promise<string> {
  const fb = eventFallback(ctx);
  if (!apiKey) return fb;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 150, system: EVENT_SYSTEM, messages: [{ role: 'user', content: JSON.stringify(ctx) }] }),
    });
    if (!res.ok) return fb;
    const data = await res.json() as { content?: { text?: string }[] };
    return data.content?.[0]?.text?.trim() || fb;
  } catch { return fb; }
}

export async function oddsLine(apiKey: string | undefined, home: string, away: string, odds: { home: number; draw: number; away: number }): Promise<string> {
  const fb = `Market: ${home} ${(odds.home * 100).toFixed(0)}% · Draw ${(odds.draw * 100).toFixed(0)}% · ${away} ${(odds.away * 100).toFixed(0)}%.`;
  if (!apiKey) return fb;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 60, system: 'Write ONE plain-English sentence interpreting these football match-result probabilities for a fan. No markdown.', messages: [{ role: 'user', content: JSON.stringify({ home, away, odds }) }] }),
    });
    if (!res.ok) return fb;
    const data = await res.json() as { content?: { text?: string }[] };
    return fb + '\n' + (data.content?.[0]?.text?.trim() || '');
  } catch { return fb; }
}

function eventFallback(c: EventCtx): string {
  switch (c.type) {
    case 'goal': return `GOAL! ${c.home} ${c.score} ${c.away}. The complexion of this match just changed.`;
    case 'red_card': return `Red card! Down to ten - ${c.home} ${c.score} ${c.away}. This gets a lot harder now.`;
    case 'yellow_card': return `Yellow card shown. Tempers and tackles flying at ${c.score}.`;
    case 'kickoff': return `We're off - ${c.home} vs ${c.away} is underway.`;
    case 'half_time': return `Half time: ${c.home} ${c.score} ${c.away}. Plenty still to play for.`;
    case 'full_time': return `Full time: ${c.home} ${c.score} ${c.away}. That's the result.`;
    default: return `${c.home} ${c.score} ${c.away} - ${c.type}.`;
  }
}
