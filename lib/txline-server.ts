/**
 * Server-only TxLINE live client. Uses env credentials directly.
 * Parses the real feed schema:
 *  - fixtures: [{FixtureId, Participant1, Participant2, StartTime, GameState}]
 *  - odds: [{SuperOddsType, MarketPeriod, MarketParameters, PriceNames, Prices(x1000), Pct}]
 * StablePrice ("TXLineStablePriceDemargined") is already de-margined (Pct sums to 100).
 */

export interface LiveFixture {
  fixtureId: number;
  home: string;
  away: string;
  startTime: number;
  gameState: number; // 1 = scheduled, 3+ = played/finished
}

export interface LiveMarket {
  fixtureId: number;
  marketId: string;      // our DSL id
  selection: string;     // "home" | "away" | "draw" | "over" | "under"
  line?: number;
  fairPrice: number;     // decimal
  ts: number;            // TxLINE publish timestamp (the on-chain anchor time)
  messageId: string;
}

// Devnet odds snapshots return a rolling window of recent messages, not the
// full book. We accumulate markets across calls: Redis when configured
// (survives instances and time), in-memory fallback otherwise.
import { Redis } from "@upstash/redis";
const rUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const rTok = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const mredis = rUrl && rTok ? new Redis({ url: rUrl, token: rTok }) : null;
const marketCache = new Map<number, Map<string, LiveMarket>>();

const configured = () =>
  Boolean(process.env.TXLINE_API_ORIGIN && process.env.TXLINE_JWT && process.env.TXLINE_API_TOKEN);

async function tx(path: string): Promise<any | null> {
  if (!configured()) return null;
  const r = await fetch(`${process.env.TXLINE_API_ORIGIN}/api/${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.TXLINE_JWT}`,
      "X-Api-Token": process.env.TXLINE_API_TOKEN!,
    },
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}

export async function liveFixtures(): Promise<LiveFixture[] | null> {
  const epochDay = Math.floor(Date.now() / 86400000);
  // Free tier covers World Cup, International Friendlies, and EPL.
  // Try unfiltered first (everything the subscription covers), then fall back
  // to configured competition IDs (comma-separated), default World Cup.
  let data = await tx(`fixtures/snapshot?startEpochDay=${epochDay - 1}`);
  if (!Array.isArray(data) || data.length === 0) {
    const ids = (process.env.TXLINE_COMPETITION_IDS ?? "72").split(",").map((x) => x.trim()).filter(Boolean);
    const merged: any[] = [];
    for (const id of ids) {
      const d = await tx(`fixtures/snapshot?competitionId=${id}&startEpochDay=${epochDay - 1}`);
      if (Array.isArray(d)) merged.push(...d);
    }
    data = merged;
  }
  if (!Array.isArray(data) || data.length === 0) return null;
  const seen = new Set<number>();
  data = data.filter((f: any) => (seen.has(f.FixtureId) ? false : (seen.add(f.FixtureId), true)));
  return data.map((f: any) => ({
    fixtureId: f.FixtureId,
    home: f.Participant1IsHome ? f.Participant1 : f.Participant2,
    away: f.Participant1IsHome ? f.Participant2 : f.Participant1,
    startTime: f.StartTime,
    gameState: f.GameState,
  }));
}

function parseOdds(fixtureId: number, data: any[]): LiveMarket[] {
  const raw: LiveMarket[] = [];
  for (const o of data) {
    if (o.MarketPeriod !== null) continue; // full-time markets only for v1
    const prices: number[] = o.Prices ?? [];
    const line = o.MarketParameters?.startsWith("line=")
      ? Number(o.MarketParameters.slice(5))
      : undefined;
    const push = (marketId: string, selection: string, idx: number) => {
      if (prices[idx]) raw.push({
        fixtureId, marketId, selection, line,
        fairPrice: prices[idx] / 1000, ts: o.Ts, messageId: o.MessageId,
      });
    };
    if (o.SuperOddsType === "1X2_PARTICIPANT_RESULT") {
      push("home_win", "home", 0); push("draw", "draw", 1); push("away_win", "away", 2);
    } else if (o.SuperOddsType === "OVERUNDER_PARTICIPANT_GOALS") {
      push("over_goals", "over", 0); push("under_goals", "under", 1);
    } else if (o.SuperOddsType === "ASIANHANDICAP_PARTICIPANT_GOALS") {
      push("home_handicap", "home", 0);
      if (prices[1]) raw.push({
        fixtureId, marketId: "away_handicap", selection: "away",
        line: line !== undefined ? -line : undefined,
        fairPrice: prices[1] / 1000, ts: o.Ts, messageId: o.MessageId,
      });
    }
  }
  return raw;
}

export async function liveMarkets(fixtureId: number): Promise<LiveMarket[]> {
  if (!marketCache.has(fixtureId)) marketCache.set(fixtureId, new Map());
  const cache = marketCache.get(fixtureId)!;
  const rkey = `fairplay:markets:${fixtureId}`;
  // Seed from Redis: every line ever seen for this fixture
  if (mredis && cache.size === 0) {
    try {
      const h = await mredis.hgetall<Record<string, LiveMarket>>(rkey);
      if (h) for (const [k, m] of Object.entries(h)) cache.set(k, m);
    } catch {}
  }
  // Pull fresh snapshot windows and merge
  const fresh: Record<string, LiveMarket> = {};
  for (let i = 0; i < 3; i++) {
    const data = await tx(`odds/snapshot/${fixtureId}`);
    if (Array.isArray(data)) {
      for (const m of parseOdds(fixtureId, data)) {
        const k = `${m.marketId}:${m.line ?? ""}`;
        const prev = cache.get(k);
        if (!prev || m.ts > prev.ts) { cache.set(k, m); fresh[k] = m; }
      }
    }
    if (i < 2) await new Promise((r) => setTimeout(r, 350));
  }
  if (mredis && Object.keys(fresh).length) {
    try { await mredis.hset(rkey, fresh); } catch {}
  }
  return [...cache.values()];
}

export async function liveBoard() {
  const fixtures = await liveFixtures();
  if (!fixtures) return null;
  const now = Date.now();
  // strictly upcoming: kickoff in the future, nothing started or played
  const upcoming = fixtures.filter((f) => f.startTime > now && f.gameState !== 3);
  const markets: Record<number, LiveMarket[]> = {};
  for (const f of upcoming) markets[f.fixtureId] = await liveMarkets(f.fixtureId);
  return { fixtures, upcoming, markets };
}
