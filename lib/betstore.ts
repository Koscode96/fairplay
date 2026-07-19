/**
 * Persistent bet book on Railway Postgres (DATABASE_URL).
 * Falls back to in-memory when DATABASE_URL is absent, so the app
 * always works. Table auto-creates on first use.
 */
import { Pool } from "pg";

export type Fill = { taker: string; amount: number; sig: string; ts: number };
export type OpenBet = {
  d: string; label: string; fairPrice: number; stake: number;
  creator: string; ts: number; fills: Fill[]; ko?: number | null;
};

const url = process.env.DATABASE_URL;
const pool: Pool | null = url
  ? ((globalThis as any).__flPool ?? ((globalThis as any).__flPool = new Pool({
      connectionString: url,
      ssl: url.includes("railway") || url.includes("rlwy") ? { rejectUnauthorized: false } : undefined,
      max: 3,
    })))
  : null;

const mem: Map<string, OpenBet> = (globalThis as any).__flBets2 ?? ((globalThis as any).__flBets2 = new Map());
export const persistent = Boolean(pool);

let ready: Promise<void> | null = null;
const init = () => {
  if (!pool) return Promise.resolve();
  if (!ready) {
    ready = pool.query(`CREATE TABLE IF NOT EXISTS fairplay_bets (
      d TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      ts BIGINT NOT NULL
    )`).then(() => undefined);
  }
  return ready;
};

export async function allBets(): Promise<OpenBet[]> {
  if (!pool) return [...mem.values()];
  await init();
  const r = await pool.query("SELECT data FROM fairplay_bets ORDER BY ts DESC LIMIT 50");
  return r.rows.map((row) => row.data as OpenBet);
}

export async function getBet(d: string): Promise<OpenBet | null> {
  if (!pool) return mem.get(d) ?? null;
  await init();
  const r = await pool.query("SELECT data FROM fairplay_bets WHERE d = $1", [d]);
  return r.rows[0]?.data ?? null;
}

export async function putBet(b: OpenBet): Promise<void> {
  if (!pool) { mem.set(b.d, b); return; }
  await init();
  await pool.query(
    "INSERT INTO fairplay_bets (d, data, ts) VALUES ($1, $2, $3) ON CONFLICT (d) DO UPDATE SET data = $2",
    [b.d, JSON.stringify(b), b.ts]
  );
}
