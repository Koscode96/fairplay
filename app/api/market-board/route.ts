import { NextResponse } from "next/server";
import { liveBoard } from "../../../lib/txline-server";

/** Full live TxLINE market board, grouped per fixture. */
export async function GET() {
  const board = await liveBoard();
  if (!board || !board.upcoming.length) return NextResponse.json({ live: false }, { status: 503 });
  const fixtures = board.upcoming.map((f) => {
    const ms = board.markets[f.fixtureId] ?? [];
    const px = (mid: string, line?: number) =>
      ms.find((m) => m.marketId === mid && (line === undefined ? m.line === undefined : m.line === line));
    const ouLines = [...new Set(ms.filter((m) => m.marketId === "over_goals").map((m) => m.line))].sort((a: any, b: any) => a - b);
    const ahLines = [...new Set(ms.filter((m) => m.marketId === "home_handicap").map((m) => m.line))].sort((a: any, b: any) => a - b);
    return {
      fixtureId: String(f.fixtureId), home: f.home, away: f.away, startTime: f.startTime,
      oneX2: {
        home: px("home_win")?.fairPrice ?? null,
        draw: px("draw")?.fairPrice ?? null,
        away: px("away_win")?.fairPrice ?? null,
        ts: px("home_win")?.ts ?? null,
      },
      goals: ouLines.map((l) => ({
        line: l,
        over: ms.find((m) => m.marketId === "over_goals" && m.line === l)?.fairPrice ?? null,
        under: ms.find((m) => m.marketId === "under_goals" && m.line === l)?.fairPrice ?? null,
      })),
      handicap: ahLines.map((l) => ({
        line: l,
        home: px("home_handicap", l as number)?.fairPrice ?? null,
        away: ms.find((m) => m.marketId === "away_handicap" && m.line === -(l as number))?.fairPrice ?? null,
      })),
    };
  });
  return NextResponse.json({ live: true, fixtures });
}
