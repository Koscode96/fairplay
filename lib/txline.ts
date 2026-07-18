/**
 * TxLINE client. Calls our server-side proxy (/api/txline/*) which attaches
 * the guest JWT + X-Api-Token from env. If the proxy reports "not configured"
 * (no credentials yet), callers fall back to mock data — the app always works.
 */
import { fixtures as mockFixtures, stablePrices as mockPrices, settledStats, eventTimeline } from "./mock";
import type { MatchStats } from "./markets";

export interface LiveStatus { configured: boolean; network?: string }

export async function txStatus(): Promise<LiveStatus> {
  try {
    const r = await fetch("/api/txline/__status");
    return await r.json();
  } catch {
    return { configured: false };
  }
}

async function proxy<T>(path: string): Promise<T | null> {
  const r = await fetch(`/api/txline/${path}`);
  if (!r.ok) return null;
  return (await r.json()) as T;
}

/** Fixtures: live if configured, mock otherwise. */
export async function getFixtures() {
  const live = await proxy<unknown[]>("fixtures/snapshot");
  return live ?? mockFixtures;
}

/** Odds snapshot for a fixture. */
export async function getOdds(fixtureId: string) {
  const live = await proxy<unknown>(`odds/snapshot/${fixtureId}`);
  return live ?? mockPrices.filter((p) => p.fixtureId === fixtureId);
}

/** Verified stats + Merkle proof for settlement. */
export async function getStatValidation(fixtureId: string) {
  const live = await proxy<unknown>(`scores/stat-validation?fixtureId=${fixtureId}`);
  return live ?? { mock: true, stats: settledStats[fixtureId] as MatchStats | undefined };
}

export { mockFixtures, mockPrices, settledStats, eventTimeline };
