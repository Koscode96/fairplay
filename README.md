# FairPlay

**See what your bookie is really charging you — then take the bet at fair odds instead.**
TxODDS × Solana World Cup Hackathon. Next.js app: Acca X-ray (Consumer) → Fair Bets P2P (Prediction Markets).

## Run locally
```bash
npm install
npm run dev        # http://localhost:3000 — works immediately on demo data
```

## Deploy to Vercel (5 min)
```bash
npm i -g vercel    # if not installed
vercel             # from this folder; accept defaults
vercel --prod
```
Or push to GitHub and import at vercel.com/new. No env vars needed for demo mode.

## Go live on TxLINE (devnet — free, ~20 min)
1. Phantom → enable Testnet mode → Devnet. Airdrop SOL: `solana airdrop 2 <pubkey> --url devnet` or faucet.solana.com
2. Run TxODDS's **Runnable Devnet Examples** (docs → Examples) free-tier activation:
   does guest JWT → on-chain `subscribe` (free tier, SL 1 or 12) → signed activation.
   Activation preimage for free bundle: `${txSig}::${jwt}`
3. Take the JWT + apiToken it prints (or use `node scripts/activate.mjs`) and set in
   Vercel → Project → Settings → Environment Variables:
   - `TXLINE_API_ORIGIN=https://txline-dev.txodds.com`
   - `TXLINE_JWT=…`  `TXLINE_API_TOKEN=…`
4. Redeploy. Header flips from DEMO DATA → TxLINE LIVE · DEVNET.
   JWT expired later? `node scripts/activate.mjs devnet` for a fresh one (same apiToken keeps working).

Submission rules allow "functional build **or live testnet application**" — devnet qualifies.

## Architecture
- `app/page.tsx` — full funnel UI (slip → X-ray scan → P2P + settlement certificate)
- `lib/engine.ts` — de-margin/EV engine · `lib/markets.ts` — market DSL + settlement (abandonment → VOID)
- `lib/txline.ts` + `app/api/txline/[...path]/route.ts` — live client via server proxy (creds in env, never in browser); automatic mock fallback
- `lib/phantom.ts` — wallet connect + bet-commitment signing (window.phantom, no adapter deps)
- Engine + DSL are covered by 11 unit tests in the sibling `fairline` repo.
