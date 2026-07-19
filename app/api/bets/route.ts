import { NextRequest, NextResponse } from "next/server";

/**
 * FairPlay open-bets feed with fractional matching.
 * Backer stakes S at odds O. Total taker liability = S*(O-1).
 * Each taker fills part of that liability; wins their fraction of S if the
 * bet fails, loses their fill if it lands. In-memory for the hackathon.
 */
type Fill = { taker: string; amount: number; sig: string; ts: number };
type OpenBet = {
  d: string; label: string; fairPrice: number; stake: number;
  creator: string; ts: number; fills: Fill[];
};
const store: OpenBet[] = (globalThis as any).__flBets ?? ((globalThis as any).__flBets = []);

const enrich = (b: OpenBet) => {
  const totalLiability = Number((b.stake * (b.fairPrice - 1)).toFixed(2));
  const matched = Number(b.fills.reduce((s, f) => s + f.amount, 0).toFixed(2));
  return { ...b, totalLiability, matched, remaining: Number((totalLiability - matched).toFixed(2)) };
};

export async function GET(req: NextRequest) {
  const d = req.nextUrl.searchParams.get("d");
  if (d) {
    const b = store.find((x) => x.d === d);
    return b ? NextResponse.json({ bet: enrich(b) }) : NextResponse.json({ bet: null });
  }
  return NextResponse.json({ bets: [...store].sort((a, b) => b.ts - a.ts).slice(0, 50).map(enrich) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "fill") {
    const b = store.find((x) => x.d === body.d);
    if (!b) return NextResponse.json({ error: "bet not found" }, { status: 404 });
    const e = enrich(b);
    const amount = Number(body.amount);
    if (!body.taker || !body.sig || !(amount > 0)) return NextResponse.json({ error: "bad fill" }, { status: 400 });
    if (amount > e.remaining + 0.001) return NextResponse.json({ error: `only £${e.remaining} remaining` }, { status: 409 });
    b.fills.push({ taker: body.taker, amount: Number(amount.toFixed(2)), sig: body.sig, ts: Date.now() });
    return NextResponse.json({ ok: true, bet: enrich(b) });
  }

  if (!body?.d || !body?.label || !body?.creator) return NextResponse.json({ error: "bad bet" }, { status: 400 });
  if (!store.some((x) => x.d === body.d)) {
    store.unshift({ d: body.d, label: body.label, fairPrice: body.fairPrice, stake: body.stake ?? 10, creator: body.creator, ts: Date.now(), fills: [] });
  }
  return NextResponse.json({ ok: true });
}
