import { NextRequest, NextResponse } from "next/server";

/** FairPlay open-bets feed. In-memory for the hackathon (chain-indexed in prod). */
type OpenBet = { d: string; label: string; fairPrice: number; stake: number; creator: string; ts: number };
const store: OpenBet[] = (globalThis as any).__flBets ?? ((globalThis as any).__flBets = []);

export async function GET() {
  return NextResponse.json({ bets: [...store].sort((a, b) => b.ts - a.ts).slice(0, 50) });
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b?.d || !b?.label || !b?.creator) return NextResponse.json({ error: "bad bet" }, { status: 400 });
  if (!store.some((x) => x.d === b.d)) store.unshift({ d: b.d, label: b.label, fairPrice: b.fairPrice, stake: b.stake ?? 10, creator: b.creator, ts: Date.now() });
  return NextResponse.json({ ok: true, count: store.length });
}
