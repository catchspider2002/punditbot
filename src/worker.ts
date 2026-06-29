// PunditBot — Cloudflare Worker. Telegram webhook + commands; MatchRoom DO pushes live updates.
import { listFixtures, getOdds, TxEnv } from './txline';
import { oddsLine } from './commentary';
import { sendMessage, answerCallback, inlineKeyboard, tg } from './telegram';
export { MatchRoom } from './matchRoom';

export interface Env {
  DB: D1Database; ASSETS: Fetcher; MATCH_ROOM: DurableObjectNamespace;
  TXLINE_API_KEY?: string; ANTHROPIC_API_KEY?: string; TELEGRAM_BOT_TOKEN?: string;
  WEBHOOK_SECRET?: string; ADMIN_KEY?: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/webhook' && req.method === 'POST') {
      if (env.WEBHOOK_SECRET && req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 401 });
      const update = await req.json().catch(() => ({}));
      await handle(env, update as any).catch((e) => console.log('handle error', String(e)));
      return new Response('ok'); // always 200 so Telegram doesn't retry-storm
    }
    if (url.pathname === '/setwebhook' && req.method === 'GET') {
      if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) return json({ error: 'forbidden' }, 403);
      if (!env.TELEGRAM_BOT_TOKEN) return json({ error: 'TELEGRAM_BOT_TOKEN not set' }, 400);
      const r = await tg(env.TELEGRAM_BOT_TOKEN, 'setWebhook', { url: `${url.origin}/webhook`, secret_token: env.WEBHOOK_SECRET || undefined, allowed_updates: ['message', 'callback_query'] });
      return json(r);
    }
    return env.ASSETS.fetch(req);
  },
};

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

async function handle(env: Env, update: any): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN; if (!token) return;
  if (update.callback_query) return onCallback(env, token, update.callback_query);
  const msg = update.message; if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const [cmd, arg] = String(msg.text).trim().split(/\s+/, 2);

  if (cmd === '/start') {
    await sendMessage(token, chatId, 'Welcome to PunditBot — your AI football pundit for the 2026 World Cup.\n\nI message you when something significant happens in a match: goals, red cards, big moments — with a proper take on what it means.\n\nUse /matches to see what is on.');
  } else if (cmd === '/matches') {
    await matchesList(env, token, chatId);
  } else if (cmd === '/follow' && arg) {
    await follow(env, token, chatId, arg);
  } else if (cmd === '/unfollow') {
    await unfollowList(env, token, chatId);
  } else if (cmd === '/odds' && arg) {
    await oddsCmd(env, token, chatId, arg);
  } else if (cmd === '/recap' && arg) {
    await recap(env, token, chatId, arg);
  } else {
    await sendMessage(token, chatId, 'Commands: /matches, /follow <id>, /unfollow, /odds <id>, /recap <id>');
  }
}

async function onCallback(env: Env, token: string, cq: any): Promise<void> {
  const chatId = cq.message?.chat?.id; const data = String(cq.data || '');
  if (data.startsWith('follow:')) { await follow(env, token, chatId, data.slice(7)); await answerCallback(token, cq.id, 'Following'); }
  else if (data.startsWith('unfollow:')) { const id = data.slice(9); await env.DB.prepare('DELETE FROM subs WHERE match_id=? AND chat_id=?').bind(id, String(chatId)).run(); await answerCallback(token, cq.id, 'Unfollowed'); await sendMessage(token, chatId, 'Unfollowed.'); }
  else await answerCallback(token, cq.id);
}

function txenv(env: Env): TxEnv { return { DB: env.DB, TXLINE_API_KEY: env.TXLINE_API_KEY }; }

function whenLabel(start: number, now: number): string {
  const d = start - now;
  if (d <= 0 && d > -3 * 3600e3) return 'LIVE';
  const h = Math.floor(d / 3600e3), m = Math.round((d % 3600e3) / 60e3);
  if (h >= 24) return `in ${Math.round(h / 24)}d`;
  if (h >= 1) return `in ${h}h`;
  return `in ${Math.max(m, 1)}m`;
}

async function matchesList(env: Env, token: string, chatId: number): Promise<void> {
  let fx; try { fx = await listFixtures(txenv(env)); } catch { await sendMessage(token, chatId, 'Could not load fixtures right now.'); return; }
  const now = Date.now();
  // Live (kicked off within last ~3h) + all upcoming, soonest first, next 10.
  const soon = fx.filter((f) => f.startTime >= now - 3 * 3600e3).sort((a, b) => a.startTime - b.startTime).slice(0, 10);
  if (!soon.length) { await sendMessage(token, chatId, 'No upcoming World Cup matches found right now.'); return; }
  const rows = soon.map((f) => [{ text: `${f.home} vs ${f.away} · ${whenLabel(f.startTime, now)}`, callback_data: `follow:${f.fixtureId}` }]);
  await sendMessage(token, chatId, 'Tap a match to follow:', inlineKeyboard(rows));
}

async function follow(env: Env, token: string, chatId: number, fixtureId: string): Promise<void> {
  let fx; try { fx = (await listFixtures(txenv(env))).find((f) => String(f.fixtureId) === String(fixtureId)); } catch { fx = undefined; }
  const home = fx?.home || 'Home', away = fx?.away || 'Away';
  await env.DB.prepare('INSERT OR IGNORE INTO subs (match_id,chat_id,home_team,away_team) VALUES (?,?,?,?)').bind(String(fixtureId), String(chatId), home, away).run();
  const id = env.MATCH_ROOM.idFromName(String(fixtureId));
  await env.MATCH_ROOM.get(id).fetch(new Request('https://room/ensure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fixtureId: String(fixtureId), home, away }) }));
  await sendMessage(token, chatId, `You're following ${home} vs ${away}. I'll message you when something happens.`);
}

async function unfollowList(env: Env, token: string, chatId: number): Promise<void> {
  const r = await env.DB.prepare('SELECT match_id, home_team, away_team FROM subs WHERE chat_id=?').bind(String(chatId)).all<any>();
  const rows = (r.results || []).map((s) => [{ text: `Unfollow ${s.home_team} vs ${s.away_team}`, callback_data: `unfollow:${s.match_id}` }]);
  if (!rows.length) { await sendMessage(token, chatId, 'You are not following any matches.'); return; }
  await sendMessage(token, chatId, 'Your followed matches:', inlineKeyboard(rows));
}

async function oddsCmd(env: Env, token: string, chatId: number, fixtureId: string): Promise<void> {
  const odds = await getOdds(txenv(env), fixtureId);
  if (!odds) { await sendMessage(token, chatId, 'No odds available for that match id.'); return; }
  const sub = await env.DB.prepare('SELECT home_team, away_team FROM subs WHERE match_id=? LIMIT 1').bind(String(fixtureId)).first<any>();
  const home = sub?.home_team || 'Home', away = sub?.away_team || 'Away';
  const line = await oddsLine(env.ANTHROPIC_API_KEY, home, away, odds.implied);
  await sendMessage(token, chatId, `${home} vs ${away}\n${home} ${odds.decimal.home}  Draw ${odds.decimal.draw}  ${away} ${odds.decimal.away}\n\n${line}`);
}

async function recap(env: Env, token: string, chatId: number, fixtureId: string): Promise<void> {
  const r = await env.DB.prepare('SELECT text FROM match_events WHERE match_id=? ORDER BY ts ASC LIMIT 30').bind(String(fixtureId)).all<any>();
  const lines = (r.results || []).map((e) => '• ' + e.text);
  await sendMessage(token, chatId, lines.length ? 'Recap:\n\n' + lines.join('\n\n') : 'No events recorded yet for that match.');
}
