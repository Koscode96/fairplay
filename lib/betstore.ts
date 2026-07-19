/**
 * Persistent bet book. Upstash Redis when configured (KV_REST_API_URL /
 * UPSTASH_REDIS_REST_URL), in-memory fallback otherwise. Bets in a hash
 * keyed by their encoded payload `d`.
 */
import { Redis } from "@upstash/redis";

export type Fill = { taker: string; amount: number; sig: string; ts: number };
export type OpenBet = {
  d: string; label: string; fairPrice: number; stake: number;
  creator: string; ts: number; fills: Fill[];
};

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
const HASH = "fairplay:bets";

const mem: Map<string, OpenBet> = (globalThis as any).__flBets2 ?? ((globalThis as any).__flBets2 = new Map());

export const persistent = Boolean(redis);

export async function allBets(): Promise<OpenBet[]> {
  if (!redis) return [...mem.values()];
  const h = await redis.hgetall<Record<string, OpenBet>>(HASH);
  return h ? Object.values(h) : [];
}

export async function getBet(d: string): Promise<OpenBet | null> {
  if (!redis) return mem.get(d) ?? null;
  return (await redis.hget<OpenBet>(HASH, d)) ?? null;
}

export async function putBet(b: OpenBet): Promise<void> {
  if (!redis) { mem.set(b.d, b); return; }
  await redis.hset(HASH, { [b.d]: b });
}
