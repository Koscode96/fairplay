import { NextResponse } from "next/server";
import { liveBoard } from "../../../lib/txline-server";

/** Builds a starter acca from LIVE fixtures + StablePrice fair odds. */
export async function GET() {
  const board = await liveBoard();
  if (!board || !board.upcoming.length) {
    return NextResponse.json({ live: false }, { status: 503 });
  }
  const legs: any[] = [];
  const seen = new Set<string>();
  const add = (leg: any) => { if (!seen.has(leg.key)) { seen.add(leg.key); legs.push(leg); } };

  const debug: Record<string, number> = {};
  for (const f of board.upcoming) {
    const ms = board.markets[f.fixtureId] ?? [];
    debug[`${f.home} v ${f.away}`] = ms.length;
    const ko = new Date(f.startTime).toLocaleString("en-GB", {
      weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
    });
    const mkLeg = (key: string, marketId: string, line: number | undefined, label: string, fair: number, ts: number, haircut: number) =>
      add({
        key: `${f.fixtureId}-${key}`, fixtureId: String(f.fixtureId), marketId, line,
        label, sub: `LIVE · ${f.home} v ${f.away} · KO ${ko} · fair ${fair.toFixed(2)}`,
        fairPrice: fair, bookiePrice: Number((fair * haircut).toFixed(2)),
        proofRef: `tx:${ts}`, matched: true, ko: f.startTime,
      });

    // Leg A: match result favourite, else handicap, else nothing
    const oneX2 = ms.filter((m) => ["home_win", "away_win"].includes(m.marketId));
    if (oneX2.length) {
      const fav = oneX2.reduce((a, b) => (a.fairPrice < b.fairPrice ? a : b));
      const team = fav.marketId === "home_win" ? f.home : f.away;
      const opp = fav.marketId === "home_win" ? f.away : f.home;
      mkLeg("res", fav.marketId, undefined, `${team} to beat ${opp}`, fav.fairPrice, fav.ts, 0.94);
    } else {
      const ah = ms.find((m) => m.marketId === "home_handicap" && (m.line === 0 || m.line === -0.5));
      if (ah) mkLeg("ah", "home_handicap", ah.line, `${f.home} ${ah.line === 0 ? "(AH 0)" : ah.line} v ${f.away}`, ah.fairPrice, ah.ts, 0.94);
    }
    // Leg B: goals total — prefer 2.5, else nearest line
    const ou = ms.filter((m) => m.marketId === "over_goals");
    const o25 = ou.find((m) => m.line === 2.5) ?? ou.sort((a, b) => Math.abs((a.line ?? 9) - 2.5) - Math.abs((b.line ?? 9) - 2.5))[0];
    if (o25) mkLeg("ou", "over_goals", o25.line, `${f.home} v ${f.away} — Over ${o25.line} goals`, o25.fairPrice, o25.ts, 0.93);
    // Leg C: Asian handicap — prefer -0.5, else 0
    const ah = ms.find((m) => m.marketId === "home_handicap" && m.line === -0.5)
      ?? ms.find((m) => m.marketId === "home_handicap" && m.line === 0);
    if (ah) mkLeg("ah2", "home_handicap", ah.line, `${f.home} ${ah.line === 0 ? "AH 0" : `${ah.line}`} v ${f.away}`, ah.fairPrice, ah.ts, 0.94);
  }
  return NextResponse.json({ live: true, legs: legs.slice(0, 6), debug });
}
