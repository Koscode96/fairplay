/**
 * Fairline market DSL.
 * Translates human bets into TxLINE on-chain stat predicates and settles them
 * against verified match stats. Match-level only (goals / cards / corners per
 * team per period) — mirrors TxLINE's on-chain stat encoding.
 */

// ---- TxLINE-shaped primitives -------------------------------------------

export type StatName = "goals" | "yellow_cards" | "red_cards" | "corners";
export type Side = "home" | "away";
export type Period = "FT" | "H1" | "H2" | "ET1" | "ET2" | "PEN";

/** Verified stats for one fixture, as settled on-chain. */
export interface MatchStats {
  phase:
    | "finished"
    | "abandoned"
    | "postponed"
    | "interrupted"
    | "in_play"
    | "scheduled";
  stats: Partial<Record<Period, Record<Side, Partial<Record<StatName, number>>>>>;
}

export type Predicate =
  | {
      kind: "threshold";
      terms: Array<{ stat: StatName; side: Side; period: Period }>;
      op: "gt" | "lt" | "eq";
      value: number;
    }
  | {
      kind: "twoStatSubtract"; // maps to validateStat two-stat operation
      a: { stat: StatName; side: Side; period: Period };
      b: { stat: StatName; side: Side; period: Period };
      op: "gt" | "lt" | "eq";
      value: number;
    };

export type SettlementOutcome = "won" | "lost" | "void" | "pending";

export interface MarketDef {
  id: string;
  label: (p?: number) => string;
  predicate: (line?: number) => Predicate;
  needsLine?: boolean;
}

// ---- Market catalogue ----------------------------------------------------

const t = (
  terms: Predicate & { kind: "threshold" } extends infer _ ? Array<{ stat: StatName; side: Side; period: Period }> : never,
  op: "gt" | "lt" | "eq",
  value: number
): Predicate => ({ kind: "threshold", terms, op, value });

export const MARKETS: Record<string, MarketDef> = {
  home_win: {
    id: "home_win",
    label: () => "Home win",
    predicate: () => ({
      kind: "twoStatSubtract",
      a: { stat: "goals", side: "home", period: "FT" },
      b: { stat: "goals", side: "away", period: "FT" },
      op: "gt",
      value: 0,
    }),
  },
  away_win: {
    id: "away_win",
    label: () => "Away win",
    predicate: () => ({
      kind: "twoStatSubtract",
      a: { stat: "goals", side: "away", period: "FT" },
      b: { stat: "goals", side: "home", period: "FT" },
      op: "gt",
      value: 0,
    }),
  },
  draw: {
    id: "draw",
    label: () => "Draw",
    predicate: () => ({
      kind: "twoStatSubtract",
      a: { stat: "goals", side: "home", period: "FT" },
      b: { stat: "goals", side: "away", period: "FT" },
      op: "eq",
      value: 0,
    }),
  },
  over_goals: {
    id: "over_goals",
    needsLine: true,
    label: (l) => `Over ${l} goals`,
    predicate: (l = 2.5) =>
      t(
        [
          { stat: "goals", side: "home", period: "FT" },
          { stat: "goals", side: "away", period: "FT" },
        ],
        "gt",
        l
      ),
  },
  under_goals: {
    id: "under_goals",
    needsLine: true,
    label: (l) => `Under ${l} goals`,
    predicate: (l = 2.5) =>
      t(
        [
          { stat: "goals", side: "home", period: "FT" },
          { stat: "goals", side: "away", period: "FT" },
        ],
        "lt",
        l
      ),
  },
  btts: {
    id: "btts",
    label: () => "Both teams to score",
    // composed as two single-stat checks at evaluation time
    predicate: () =>
      t([{ stat: "goals", side: "home", period: "FT" }], "gt", 0.5),
  },
  over_corners: {
    id: "over_corners",
    needsLine: true,
    label: (l) => `Over ${l} corners`,
    predicate: (l = 9.5) =>
      t(
        [
          { stat: "corners", side: "home", period: "FT" },
          { stat: "corners", side: "away", period: "FT" },
        ],
        "gt",
        l
      ),
  },
  over_cards: {
    id: "over_cards",
    needsLine: true,
    label: (l) => `Over ${l} cards`,
    predicate: (l = 4.5) =>
      t(
        [
          { stat: "yellow_cards", side: "home", period: "FT" },
          { stat: "yellow_cards", side: "away", period: "FT" },
          { stat: "red_cards", side: "home", period: "FT" },
          { stat: "red_cards", side: "away", period: "FT" },
        ],
        "gt",
        l
      ),
  },
  away_handicap: {
    id: "away_handicap",
    needsLine: true,
    label: (l) => `Away ${l! > 0 ? "+" : ""}${l}`,
    predicate: (l = 0.5) => ({
      kind: "twoStatSubtract",
      a: { stat: "goals", side: "away", period: "FT" },
      b: { stat: "goals", side: "home", period: "FT" },
      op: "gt",
      value: -l!,
    }),
  },
  home_handicap: {
    id: "home_handicap",
    needsLine: true,
    label: (l) => `Home ${l! > 0 ? "+" : ""}${l}`,
    predicate: (l = -1.5) => ({
      kind: "twoStatSubtract",
      a: { stat: "goals", side: "home", period: "FT" },
      b: { stat: "goals", side: "away", period: "FT" },
      op: "gt",
      value: -l!,
    }),
  },
};

// ---- Settlement ----------------------------------------------------------

const read = (s: MatchStats, term: { stat: StatName; side: Side; period: Period }) =>
  s.stats[term.period]?.[term.side]?.[term.stat] ?? 0;

const cmp = (x: number, op: "gt" | "lt" | "eq", v: number) =>
  op === "gt" ? x > v : op === "lt" ? x < v : x === v;

/**
 * Settle a market against verified stats.
 * Abandonment rule (spec §3.3): abandoned / postponed / interrupted → void.
 */
export const settle = (
  marketId: string,
  line: number | undefined,
  stats: MatchStats
): SettlementOutcome => {
  if (stats.phase === "in_play" || stats.phase === "scheduled") return "pending";
  if (stats.phase !== "finished") return "void";

  if (marketId === "btts") {
    const h = read(stats, { stat: "goals", side: "home", period: "FT" });
    const a = read(stats, { stat: "goals", side: "away", period: "FT" });
    return h > 0 && a > 0 ? "won" : "lost";
  }

  const def = MARKETS[marketId];
  if (!def) throw new Error(`unknown market ${marketId}`);
  const p = def.predicate(line);

  if (p.kind === "threshold") {
    const total = p.terms.reduce((s, term) => s + read(stats, term), 0);
    return cmp(total, p.op, p.value) ? "won" : "lost";
  }
  const diff = read(stats, p.a) - read(stats, p.b);
  return cmp(diff, p.op, p.value) ? "won" : "lost";
};
