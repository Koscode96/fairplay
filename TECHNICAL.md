# FairPlay: Technical Documentation

Peer-to-peer fair-odds exchange for the TxODDS World Cup Hackathon (Prediction Markets and Settlement track). Solo build. Companion to Fairline; shared fair-odds engine, built separately for this track's settlement criteria.

## What it does
Challenges post at TxLINE StablePrice fair odds (singles or multi-leg combos), fill fractionally from £1 by any number of takers, close to new takers at kickoff (server-enforced), and settle deterministically against TxLINE verified match data with per-leg rulings and rule-based VOID.

## Stack
Next.js 15, React 19, TypeScript, Vercel. Upstash Redis for the persistent order book and the shared accumulated market book. TxLINE devnet (service level 1, on-chain activation). Solana devnet Memo for wallet-signed commitment recording.

## Architecture
```
/            open-bets board + live fair panel (+ historical final showcase)
/xray        create: shortlist from board -> combo/singles -> terms -> sign & post
/bet?d=...   accept: fractional fill, takers ledger, result check
/api/bets    order book (create / fill / list; KO cutoff on fills)
/api/settle-check  rules one market against live TxLINE scores
/api/market-board  accumulated book (+ showcase)
lib/: betstore (Redis book), bet-codec (link-encoded bets incl. combo legs),
      markets DSL (result/totals/handicaps, VOID on abandonment), engine, flags
```

## Bet lifecycle
1. **Create.** Shortlist fair prices from the live board. Multi-leg posts as a COMBO by default at the combined price (legs multiplied, labelled as such) with a SINGLES toggle. Stake set on the terms ticket with payout and taker-liability maths.
2. **Sign.** Phantom signs the full terms (market/legs, price, stake, timestamp). The payload is base64url-encoded into the share link and mirrored to the Redis book with the fixture kickoff.
3. **Fill.** Total taker liability = S x (O - 1). Takers fill any amount from £1 up to remaining; each fill is wallet-signed with its amount inside the signature; pro-rata payouts; liquidity bars and a takers ledger render live. Fills after kickoff are rejected (HTTP 409).
4. **Settle.** `/api/settle-check` maps finalised TxLINE scores into the market DSL. Combos rule per leg via parallel checks: any loss -> lost; any pending -> pending; a VOID leg drops out acca-style. Abandoned/postponed -> VOID, stakes returned. No human input anywhere.

## Data layer
- **Order book** in Redis (`fairplay:bets` hash), enriched with liability/matched/remaining/closed on read.
- **Market book** shared with Fairline (`fairplay:markets:{fixtureId}`), accumulated from rolling snapshot windows; survives deploys.
- **Fixture discovery** competition-agnostic (free tier spans World Cup, International Friendlies, EPL); unpriced future fixtures display "fair prices open nearer kick-off".
- **Historical showcase.** The final's pre-KO fair book renders labelled on the boards; posting on finished fixtures flows straight into settlement (challenges are closed at creation and rule via CHECK RESULT).

## Environment
`TXLINE_API_ORIGIN`, `TXLINE_JWT`, `TXLINE_API_TOKEN`, `ANTHROPIC_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, optional `TXLINE_COMPETITION_IDS`.

## Roadmap honesty
Stakes are demo-denominated; funds do not move. Next layer: SPL escrow at fill time, released by the same deterministic ruling. Correlation-aware joint pricing for same-game combos is roadmap; today combined prices are labelled "legs multiplied". Everything upstream of money movement (identity, terms, price, timing, cutoff, ruling) is verifiable in the product now.
