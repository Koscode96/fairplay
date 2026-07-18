import { NextRequest, NextResponse } from "next/server";
import { settle, MatchStats } from "../../../lib/markets";

/** Checks live TxLINE scores for a fixture and settles the given market. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const fixtureId = q.get("fixtureId");
  const marketId = q.get("marketId");
  const line = q.get("line") ? Number(q.get("line")) : undefined;
  if (!fixtureId || !marketId) return NextResponse.json({ error: "missing params" }, { status: 400 });

  const origin = process.env.TXLINE_API_ORIGIN;
  if (!origin) return NextResponse.json({ outcome: "pending", note: "feed not configured" });

  const r = await fetch(`${origin}/api/scores/snapshot/${fixtureId}`, {
    headers: { Authorization: `Bearer ${process.env.TXLINE_JWT}`, "X-Api-Token": process.env.TXLINE_API_TOKEN! },
    cache: "no-store",
  });
  if (!r.ok) return NextResponse.json({ outcome: "pending", note: `feed ${r.status}` });
  const data = await r.json();
  if (!Array.isArray(data) || !data.length) return NextResponse.json({ outcome: "pending" });

  const finalised = data.find((e: any) => e.Action === "game_finalised");
  const scored = data.filter((e: any) => e.Score).sort((a: any, b: any) => (b.Seq ?? 0) - (a.Seq ?? 0));
  const src = finalised ?? scored[0];
  if (!src?.Score) return NextResponse.json({ outcome: "pending" });

  const homeIsP1 = src.Participant1IsHome !== false;
  const side = (p: any) => ({
    goals: p?.Total?.Goals ?? 0,
    corners: p?.Total?.Corners ?? 0,
    yellow_cards: p?.Total?.YellowCards ?? 0,
    red_cards: p?.Total?.RedCards ?? 0,
  });
  const home = side(homeIsP1 ? src.Score.Participant1 : src.Score.Participant2);
  const away = side(homeIsP1 ? src.Score.Participant2 : src.Score.Participant1);

  const stats: MatchStats = {
    phase: finalised ? "finished" : "in_play",
    stats: { FT: { home, away } },
  };
  const outcome = settle(marketId, line, stats);
  return NextResponse.json({
    outcome,
    finalised: Boolean(finalised),
    score: { home: home.goals, away: away.goals },
    corners: home.corners + away.corners,
    seq: src.Seq,
    proof: `/scores/stat-validation?fixtureId=${fixtureId}&seq=${src.Seq}`,
  });
}
