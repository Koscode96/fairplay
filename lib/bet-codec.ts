/** The bet lives in the link: base64url-encoded payload, no database. */
export interface BetPayload {
  v: 1;
  fixtureId: string;
  marketId: string;
  line?: number;
  label: string;
  fairPrice: number;
  stake: number;
  creator: string;        // wallet pubkey
  creatorSig: string;     // signature over the terms
  side: "for";            // creator backs the selection; acceptor lays it
  ts: number;
}

export const encodeBet = (b: BetPayload): string =>
  btoa(unescape(encodeURIComponent(JSON.stringify(b))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const decodeBet = (s: string): BetPayload | null => {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch {
    return null;
  }
};
