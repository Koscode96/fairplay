# FairPlay: Technical Documentation

Peer-to-peer fair-odds exchange for the TxODDS World Cup Hackathon (Prediction Markets & Settlement track). Solo build. Companion to Fairline (Consumer track); shares the fair-odds engine, built separately for this track's settlement criteria.

## What it does
Users post challenges at TxLINE StablePrice fair odds from a live market board. Any number of takers fill the other side fractionally from £1. Markets close to new takers at kickoff. Outcomes settle automatically against TxLINE verified match data, with rule-based void on abandonment. Both sides sign with their own wallet and can record commitments on Solana.

## Stack
- Next.js 15 (App Router), React 19, TypeScript. Vercel.
- Upstash Redis (via Vercel Storage) for the persistent order book and accumulated market book.
- TxLINE devnet subscription (service level 1, on-chain activation).
- Solana devnet for wallet-signed commitment recording (Memo program).

## Architecture
```
/                     open-bets board (order book with liquidity bars)
/xray                 create flow: pick markets -> terms -> sign & post
/bet?d=...            taker flow: fractional fill, result check
/api/bets             order book API (GET list/one, POST create/fill)
/api/settle-check     rules a market against live TxLINE scores
/api/market-board     accumulated live markets per fixture
/api/txline/[...path] credentialed proxy to TxLINE
lib/
  betstore.ts   Redis-backed book (in-memory fallback), bets keyed by payload
  bet-codec.ts  bets are base64url-encoded in shareable links (no accounts)
  markets.ts    market DSL + settlement incl. abandonment -> VOID
  engine.ts     fair-price maths
```

## Bet lifecycle
1. Create: user shortlists markets from the live board (prices are fair and read-only), picks one, sets stake. Payout preview: backer stakes S at odds O, wins S x (O-1).
2. Sign: Phantom signs the full terms (market, fixture, price, stake, timestamp). The signed payload is encoded into the share link and posted to the order book with the fixture kickoff time.
3. Fill (fractional): total taker liability = S x (O-1). Takers fill any amount from £1 up to remaining liability; each fill is wallet-signed with its amount inside the signature. Pro-rata: a taker filling amount A risks A and wins A/(O-1) if the bet fails.
4. Cutoff: fills are rejected server-side once `now >= kickoff` (HTTP 409). The board shows the closing time and flips to closed.
5. Settle: `/api/settle-check` pulls the live scores snapshot, extracts the finalised result (or latest in-play state), maps it into the market DSL and returns won/lost/pending, or void when the fixture is abandoned or postponed. Existing fills stand; void returns stakes.

## Settlement data
TxLINE scores carry per-team totals (goals, corners, cards) with game phase and finalisation actions. Predicates cover match result (two-stat comparison), totals (threshold) and handicaps (difference threshold). All ruling is deterministic from the feed; no human input.

## Persistence
Order book and accumulated market book live in Upstash Redis (`fairplay:bets` hash; `fairplay:markets:{fixtureId}` hashes), so bets, fills and the visible odds ladder survive deploys and cold starts. In-memory fallback keeps the app functional without credentials.

## Environment
`TXLINE_API_ORIGIN`, `TXLINE_JWT`, `TXLINE_API_TOKEN`, `ANTHROPIC_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`.

## Roadmap honesty
Stakes are demo-denominated; funds do not move. The next layer is SPL escrow: deposits into a program vault at fill time, released by the same settlement ruling. Everything upstream of money movement (identity, terms, timing, cutoff, ruling) is verifiable today.
