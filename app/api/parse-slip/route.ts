import { NextRequest, NextResponse } from "next/server";
import { stablePrices, fixtures } from "../../../lib/mock";
import { liveBoard, LiveMarket } from "../../../lib/txline-server";

/**
 * POST { image: base64, mediaType } → parsed + matched slip.
 * Uses Claude vision (ANTHROPIC_API_KEY in env). Legs are matched against
 * available TxLINE StablePrice markets; unmatched legs are returned flagged,
 * never given an invented fair price.
 */

const SYSTEM = `You extract bet slips from screenshots of betting apps (bet365, SkyBet, Ladbrokes, William Hill, Paddy Power, Betfair, etc).
Return ONLY valid JSON, no markdown fences, no prose:
{
 "legs":[{"selection":"<text as shown>","homeTeam":"","awayTeam":"","market":"home_win|away_win|draw|over_goals|under_goals|btts|over_corners|over_cards|home_handicap|unknown","line":<number|null>,"price":<decimal odds|null>}],
 "accaPrice":<decimal|null>,"stake":<number|null>
}
Rules: convert fractional odds to decimal (e.g. 5/2 -> 3.5). market is from the enum only; if unsure use "unknown". homeTeam/awayTeam from the fixture line. line is the numeric handicap/total (2.5, 9.5) if present.`;

type LiveCtx = { fixtures: { fixtureId: number; home: string; away: string }[]; markets: Record<number, LiveMarket[]> } | null;

function matchLiveLeg(leg: { homeTeam: string; awayTeam: string; market: string; line: number | null }, ctx: LiveCtx) {
  if (!ctx) return null;
  const norm = (s: string) => (s || "").toLowerCase().trim();
  const fx = ctx.fixtures.find(
    (f) =>
      norm(leg.homeTeam) && norm(leg.awayTeam) &&
      (norm(f.home).includes(norm(leg.homeTeam)) || norm(leg.homeTeam).includes(norm(f.home)) ||
       norm(f.home).includes(norm(leg.awayTeam)) || norm(leg.awayTeam).includes(norm(f.home))) &&
      (norm(f.away).includes(norm(leg.awayTeam)) || norm(leg.awayTeam).includes(norm(f.away)) ||
       norm(f.away).includes(norm(leg.homeTeam)) || norm(leg.homeTeam).includes(norm(f.away)))
  );
  if (!fx) return null;
  // bookie slips may list teams in either order — flip result markets if needed
  const flipped = !norm(fx.home).includes(norm(leg.homeTeam)) && !norm(leg.homeTeam).includes(norm(fx.home));
  let marketId = leg.market;
  if (flipped && marketId === "home_win") marketId = "away_win";
  else if (flipped && marketId === "away_win") marketId = "home_win";
  const ms = ctx.markets[fx.fixtureId] ?? [];
  const m = ms.find((x) => x.marketId === marketId && (x.line == null || leg.line == null || x.line === leg.line));
  if (!m) return null;
  return { fixture: { id: String(fx.fixtureId), home: fx.home, away: fx.away }, fairPrice: m.fairPrice, proofRef: `tx:${m.ts}`, line: m.line };
}

function matchLeg(leg: {
  homeTeam: string;
  awayTeam: string;
  market: string;
  line: number | null;
}) {
  const norm = (s: string) => (s || "").toLowerCase().trim();
  const fx = fixtures.find(
    (f) =>
      (norm(f.home).includes(norm(leg.homeTeam)) || norm(leg.homeTeam).includes(norm(f.home))) &&
      (norm(f.away).includes(norm(leg.awayTeam)) || norm(leg.awayTeam).includes(norm(f.away))) &&
      norm(leg.homeTeam) !== "" &&
      norm(leg.awayTeam) !== ""
  );
  if (!fx) return null;
  const sp = stablePrices.find(
    (p) =>
      p.fixtureId === fx.id &&
      p.marketId === leg.market &&
      (p.line == null || leg.line == null || p.line === leg.line)
  );
  if (!sp) return null;
  return { fixture: fx, fairPrice: sp.price, proofRef: sp.proofRef, line: sp.line };
}

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Slip scanning not configured (ANTHROPIC_API_KEY missing)" },
      { status: 503 }
    );
  }
  const { image, mediaType } = await req.json();
  if (!image) return NextResponse.json({ error: "No image" }, { status: 400 });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType || "image/png", data: image } },
            { type: "text", text: "Extract this bet slip as JSON." },
          ],
        },
      ],
    }),
  });

  if (!r.ok) {
    const detail = await r.text();
    return NextResponse.json({ error: "Vision parse failed", detail }, { status: 502 });
  }
  const data = await r.json();
  const text: string = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n");

  let parsed;
  try {
    parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return NextResponse.json({ error: "Could not read slip", raw: text }, { status: 422 });
  }

  let liveCtx: LiveCtx = null;
  try {
    const board = await liveBoard();
    if (board) liveCtx = { fixtures: board.upcoming, markets: board.markets };
  } catch {}

  const legs = (parsed.legs ?? []).map((leg: any) => {
    const m = leg.market === "unknown" ? null : (matchLiveLeg(leg, liveCtx) ?? matchLeg(leg));
    return {
      selection: leg.selection ?? "",
      homeTeam: leg.homeTeam ?? "",
      awayTeam: leg.awayTeam ?? "",
      marketId: leg.market ?? "unknown",
      line: leg.line ?? null,
      bookiePrice: leg.price ?? null,
      matched: Boolean(m),
      fixtureId: m?.fixture.id ?? null,
      fairPrice: m?.fairPrice ?? null,
      proofRef: m?.proofRef ?? null,
    };
  });

  return NextResponse.json({
    legs,
    accaPrice: parsed.accaPrice ?? null,
    stake: parsed.stake ?? null,
    matchedCount: legs.filter((l: { matched: boolean }) => l.matched).length,
  });
}
