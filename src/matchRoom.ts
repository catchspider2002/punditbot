// PunditBot - MatchRoom Durable Object. One per followed match.
// Alarm (~15s) polls TxLINE, detects events, writes a Claude pundit message, caches it for
// /recap, and pushes it to every subscriber (from D1) via the Telegram Bot API. Stops when
// nobody is following or at full time.
import { getState, getOdds, listFixtures, State, TxEnv } from './txline';
import { punditMessage } from './commentary';
import { sendMessage } from './telegram';

const POLL_MS = 15000;
export interface RoomEnv { DB: D1Database; TXLINE_API_KEY?: string; ANTHROPIC_API_KEY?: string; TELEGRAM_BOT_TOKEN?: string }

export class MatchRoom {
  ctx: DurableObjectState; env: RoomEnv;
  constructor(ctx: DurableObjectState, env: RoomEnv) { this.ctx = ctx; this.env = env; }
  txenv(): TxEnv { return { DB: this.env.DB, TXLINE_API_KEY: this.env.TXLINE_API_KEY }; }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/ensure' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})) as { fixtureId?: string; home?: string; away?: string };
      if (b.fixtureId) await this.ctx.storage.put('fixtureId', b.fixtureId);
      if (b.home) await this.ctx.storage.put('names', { home: b.home, away: b.away });
      if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 2000);
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }

  async alarm(): Promise<void> {
    const fixtureId = await this.ctx.storage.get<string>('fixtureId');
    if (!fixtureId) return;
    const subs = await this.env.DB.prepare('SELECT chat_id FROM subs WHERE match_id=?').bind(fixtureId).all<any>();
    const chats = (subs.results || []).map((r) => r.chat_id);
    if (chats.length === 0) return; // nobody following → stop polling

    let finished = false;
    try {
      const state = await getState(this.txenv(), fixtureId);
      if (state) {
        const events = await this.detect(state);
        if (events.length) {
          const names = await this.names();
          const odds = await getOdds(this.txenv(), fixtureId);
          for (const e of events) {
            if (e === 'full_time') finished = true;
            const msg = await punditMessage(this.env.ANTHROPIC_API_KEY, { type: e, home: names.home, away: names.away, score: `${state.homeGoals}-${state.awayGoals}`, phase: state.phase, odds: odds?.implied });
            await this.env.DB.prepare('INSERT INTO match_events (match_id,ts,type,text) VALUES (?,?,?,?)').bind(fixtureId, Date.now(), e, msg).run();
            for (const c of chats) { try { await sendMessage(this.env.TELEGRAM_BOT_TOKEN!, c, msg); } catch { /* skip */ } }
          }
        }
        await this.ctx.storage.put('last', state);
      }
    } catch (err) { console.log('pb alarm error', String(err)); }
    if (!finished) await this.ctx.storage.setAlarm(Date.now() + POLL_MS);
  }

  async detect(state: State): Promise<string[]> {
    const last = await this.ctx.storage.get<State>('last');
    const out: string[] = [];
    if (!last) { if (state.phase !== 'NS') out.push(state.phase === 'HT' ? 'half_time' : 'kickoff'); return out; }
    if (last.phase !== state.phase) {
      if (state.phase === 'H1') out.push('kickoff');
      else if (state.phase === 'HT') out.push('half_time');
      else if (state.phase === 'F' || state.phase === 'FET' || state.phase === 'FPE') out.push('full_time');
    }
    const gn = state.homeGoals + state.awayGoals, gt = last.homeGoals + last.awayGoals;
    for (let i = 0; i < Math.min(gn - gt, 3); i++) out.push('goal');
    if (state.reds > last.reds) out.push('red_card');
    return out;
  }

  async names(): Promise<{ home: string; away: string }> {
    let n = await this.ctx.storage.get<{ home: string; away: string }>('names');
    if (n) return n;
    const fixtureId = await this.ctx.storage.get<string>('fixtureId');
    try { const fx = (await listFixtures(this.txenv())).find((f) => String(f.fixtureId) === fixtureId); n = fx ? { home: fx.home, away: fx.away } : { home: 'Home', away: 'Away' }; }
    catch { n = { home: 'Home', away: 'Away' }; }
    await this.ctx.storage.put('names', n);
    return n;
  }
}
