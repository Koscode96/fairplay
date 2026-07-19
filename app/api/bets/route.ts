import { NextRequest, NextResponse } from "next/server";
import { allBets, getBet, putBet, persistent, OpenBet } from "../../../lib/betstore";

const enrich = (b: OpenBet) => {
  const totalLiability = Number((b.stake * (b.fairPrice - 1)).toFixed(2));
  const matched = Number((b.fills ?? []).reduce((s, f) => s + f.amount, 0).toFixed(2));
  const closed = Boolean(b.ko && Date.now() >= b.ko);
  return { ...b, totalLiability, matched, remaining: Number((totalLiability - matched).toFixed(2)), closed };
};

export async function GET(req: NextRequest) {
  const d = req.nextUrl.searchParams.get("d");
  if (d) {
    const b = await getBet(d);
    return NextResponse.json({ bet: b ? enrich(b) : null, persistent });
  }
  const bets = await allBets();
  return NextResponse.json({
    bets: bets.sort((a, b) => b.ts - a.ts).slice(0, 50).map(enrich),
    persistent,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "fill") {
    const b = await getBet(body.d);
    if (!b) return NextResponse.json({ error: "bet not found" }, { status: 404 });
    const e = enrich(b);
    if (e.closed) return NextResponse.json({ error: "closed at kickoff" }, { status: 409 });
    const amount = Number(body.amount);
    if (!body.taker || !body.sig || !(amount > 0)) return NextResponse.json({ error: "bad fill" }, { status: 400 });
    if (amount > e.remaining + 0.001) return NextResponse.json({ error: `only £${e.remaining} remaining` }, { status: 409 });
    b.fills = [...(b.fills ?? []), { taker: body.taker, amount: Number(amount.toFixed(2)), sig: body.sig, ts: Date.now() }];
    await putBet(b);
    return NextResponse.json({ ok: true, bet: enrich(b) });
  }

  if (!body?.d || !body?.label || !body?.creator) return NextResponse.json({ error: "bad bet" }, { status: 400 });
  const existing = await getBet(body.d);
  if (!existing) {
    await putBet({ d: body.d, label: body.label, fairPrice: body.fairPrice, stake: body.stake ?? 10, creator: body.creator, ts: Date.now(), fills: [], ko: body.ko ?? null });
  }
  return NextResponse.json({ ok: true });
}
