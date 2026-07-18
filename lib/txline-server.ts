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
// full book — so we accumulate markets across calls in a warm-instance cache.
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
  const data = await tx(`fixtures/snapshot?competitionId=72&startEpochDay=${epochDay - 4}`);
  if (!Array.isArray(data)) return null;
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
    }
  }
  return raw;
}

export async function liveMarkets(fixtureId: number): Promise<LiveMarket[]> {
  if (!marketCache.has(fixtureId)) marketCache.set(fixtureId, new Map());
  const cache = marketCache.get(fixtureId)!;
  // Pull several snapshot windows and merge — book accumulates across calls
  for (let i = 0; i < 3; i++) {
    const data = await tx(`odds/snapshot/${fixtureId}`);
    if (Array.isArray(data)) {
      for (const m of parseOdds(fixtureId, data)) {
        const k = `${m.marketId}:${m.line ?? ""}`;
        const prev = cache.get(k);
        if (!prev || m.ts > prev.ts) cache.set(k, m);
      }
    }
    if (i < 2) await new Promise((r) => setTimeout(r, 350));
  }
  return [...cache.values()];
}

export async function liveBoard() {
  const fixtures = await liveFixtures();
  if (!fixtures) return null;
  const now = Date.now();
  // upcoming = kicks off in the future (or last 2h), regardless of state-flag quirks
  const upcoming = fixtures.filter((f) => f.startTime > now - 2 * 3600_000 && f.gameState !== 3);
  const markets: Record<number, LiveMarket[]> = {};
  for (const f of upcoming) markets[f.fixtureId] = await liveMarkets(f.fixtureId);
  return { fixtures, upcoming, markets };
}
