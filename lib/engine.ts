/**
 * Fairline de-margin / EV engine.
 * Pure functions, no I/O. All odds are decimal.
 */

export interface Leg {
  fixtureId: string;
  label: string;          // "France to win"
  marketId: string;       // DSL market id, e.g. "home_win"
  bookiePrice: number;    // what the bookmaker offered
  fairPrice: number;      // de-margined consensus (StablePrice or normalised)
  proofRef?: string;      // on-chain proof reference for the fair price
}

export interface XrayResult {
  legs: LegAnalysis[];
  accaBookiePrice: number;
  accaFairPrice: number;
  accaMarginPct: number;      // total margin extracted across the acca
  fairProbability: number;    // true probability of the acca landing
  expectedValuePct: number;   // EV as % of stake
  expectedValueAbs: number;   // EV in stake currency
  worstLegIndex: number;
}

export interface LegAnalysis extends Leg {
  bookieImpliedProb: number;
  fairProb: number;
  marginPct: number;          // how much this leg overcharges
}

export const impliedProb = (decimalOdds: number): number => {
  if (decimalOdds <= 1) throw new Error(`invalid odds ${decimalOdds}`);
  return 1 / decimalOdds;
};

/** Overround of a full market: sum of implied probs minus 1. ~0 = de-margined. */
export const overround = (marketPrices: number[]): number =>
  marketPrices.reduce((s, p) => s + impliedProb(p), 0) - 1;

/**
 * Normalise a full market's prices to fair (de-vigged) prices.
 * If the feed is already de-margined this is ~identity (sanity-checked upstream).
 */
export const demarginMarket = (marketPrices: number[]): number[] => {
  const probs = marketPrices.map(impliedProb);
  const total = probs.reduce((a, b) => a + b, 0);
  return probs.map((p) => total / p); // fair price = 1 / (p / total)
};

/** Margin the bookie takes on one leg: how inflated their implied prob is vs fair. */
export const legMarginPct = (bookiePrice: number, fairPrice: number): number =>
  (impliedProb(bookiePrice) / impliedProb(fairPrice) - 1) * 100;

/** Fair price of an accumulator = product of fair leg prices. */
export const accaFairPrice = (fairLegPrices: number[]): number =>
  fairLegPrices.reduce((a, b) => a * b, 1);

/** EV of a stake at bookiePrice when true probability is fairProb. */
export const expectedValue = (
  stake: number,
  bookiePrice: number,
  fairProb: number
): number => stake * (bookiePrice * fairProb - 1);

export const xray = (
  legs: Leg[],
  accaBookiePrice: number,
  stake: number
): XrayResult => {
  if (legs.length === 0) throw new Error("empty slip");
  const analysed: LegAnalysis[] = legs.map((l) => ({
    ...l,
    bookieImpliedProb: impliedProb(l.bookiePrice),
    fairProb: impliedProb(l.fairPrice),
    marginPct: legMarginPct(l.bookiePrice, l.fairPrice),
  }));
  const fair = accaFairPrice(analysed.map((l) => l.fairPrice));
  const fairProb = 1 / fair;
  const evAbs = expectedValue(stake, accaBookiePrice, fairProb);
  const worst = analysed.reduce(
    (w, l, i) => (l.marginPct > analysed[w].marginPct ? i : w),
    0
  );
  return {
    legs: analysed,
    accaBookiePrice,
    accaFairPrice: fair,
    accaMarginPct: (impliedProb(accaBookiePrice) / fairProb - 1) * 100,
    fairProbability: fairProb,
    expectedValuePct: (evAbs / stake) * 100,
    expectedValueAbs: evAbs,
    worstLegIndex: worst,
  };
};

/** Recompute an acca when a leg voids (leg price becomes 1.0). */
export const voidLeg = (legs: Leg[], index: number): Leg[] =>
  legs.map((l, i) =>
    i === index ? { ...l, bookiePrice: 1.0000001, fairPrice: 1.0000001 } : l
  );
