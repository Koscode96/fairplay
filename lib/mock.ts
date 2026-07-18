/**
 * Mock TxLINE client — same interface the real client (src/txline/) will expose.
 * DEMO DATA: fixtures/teams are placeholders; swap for live feed after activation.
 * StablePrice values are modelled as already de-margined (verify: spec §7 item B).
 */
import type { MatchStats } from "./markets";

export interface Fixture {
  id: string;
  home: string;
  away: string;
  kickoff: string; // ISO
  phase: MatchStats["phase"];
}

export interface StablePricePoint {
  fixtureId: string;
  marketId: string;
  line?: number;
  price: number;      // de-margined consensus decimal
  timestamp: string;
  proofRef: string;   // mock Solana anchor tx ref
}

const proof = (seed: string) =>
  `sol:${seed}9f${seed.length}ab…${seed.slice(0, 2)}7c`; // placeholder shape

export const fixtures: Fixture[] = [
  { id: "wc-qf1", home: "France", away: "Brazil", kickoff: "2026-07-10T19:00:00Z", phase: "finished" },
  { id: "wc-qf2", home: "England", away: "Argentina", kickoff: "2026-07-11T19:00:00Z", phase: "finished" },
  { id: "wc-sf1", home: "France", away: "Spain", kickoff: "2026-07-14T23:00:00Z", phase: "finished" },
  { id: "wc-final", home: "TBD", away: "TBD", kickoff: "2026-07-19T19:00:00Z", phase: "scheduled" },
];

export const stablePrices: StablePricePoint[] = [
  { fixtureId: "wc-qf1", marketId: "home_win", price: 2.42, timestamp: "2026-07-10T12:00:04Z", proofRef: proof("qf1hw") },
  { fixtureId: "wc-qf1", marketId: "over_goals", line: 2.5, price: 2.1, timestamp: "2026-07-10T12:00:04Z", proofRef: proof("qf1o25") },
  { fixtureId: "wc-qf2", marketId: "home_win", price: 2.85, timestamp: "2026-07-11T11:30:11Z", proofRef: proof("qf2hw") },
  { fixtureId: "wc-qf2", marketId: "over_cards", line: 4.5, price: 1.98, timestamp: "2026-07-11T11:30:11Z", proofRef: proof("qf2c45") },
  { fixtureId: "wc-sf1", marketId: "btts", price: 1.92, timestamp: "2026-07-14T15:02:41Z", proofRef: proof("sf1btts") },
  { fixtureId: "wc-sf1", marketId: "over_corners", line: 9.5, price: 2.02, timestamp: "2026-07-14T15:02:41Z", proofRef: proof("sf1co95") },
];

/** Verified final stats for the settled-certificate demo (historical replay). */
export const settledStats: Record<string, MatchStats> = {
  "wc-sf1": {
    phase: "finished",
    stats: {
      FT: {
        home: { goals: 2, corners: 7, yellow_cards: 2, red_cards: 0 },
        away: { goals: 1, corners: 4, yellow_cards: 3, red_cards: 0 },
      },
      H1: {
        home: { goals: 1, corners: 3, yellow_cards: 0, red_cards: 0 },
        away: { goals: 1, corners: 2, yellow_cards: 1, red_cards: 0 },
      },
    },
  },
};

/** Timestamped event timeline for the certificate visual. */
export const eventTimeline: Record<
  string,
  Array<{ min: number; side: "home" | "away"; type: string; detail: string }>
> = {
  "wc-sf1": [
    { min: 12, side: "home", type: "corner", detail: "Corner #1 (H)" },
    { min: 23, side: "home", type: "goal", detail: "GOAL 1–0" },
    { min: 31, side: "away", type: "yellow", detail: "Yellow card" },
    { min: 44, side: "away", type: "goal", detail: "GOAL 1–1" },
    { min: 58, side: "home", type: "corner", detail: "Corner #7 (H)" },
    { min: 67, side: "home", type: "goal", detail: "GOAL 2–1" },
    { min: 83, side: "away", type: "corner", detail: "Corner #11 total — clears 9.5 line" },
  ],
};
