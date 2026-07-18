/**
 * TxLINE activation helper (REST parts). Run AFTER the on-chain `subscribe` tx.
 * The subscribe tx itself: use TxODDS's Runnable Devnet Examples
 * (txline-docs.txodds.com → Examples → Runnable Devnet Examples) — free tier,
 * devnet SOL airdrop covers fees. Then:
 *
 *   node scripts/activate.mjs <network: devnet|mainnet> <txSig> <base64WalletSignature>
 *
 * Where base64WalletSignature = detached sig over `${txSig}::${jwt}` — the
 * devnet example scripts produce this for you; this helper is for re-activation
 * or if you did subscribe via Phantom manually.
 * Prints TXLINE_JWT and TXLINE_API_TOKEN to paste into Vercel env.
 */
const [,, network = "devnet", txSig, walletSignature] = process.argv;
const origin = network === "mainnet" ? "https://txline.txodds.com" : "https://txline-dev.txodds.com";

const jwtRes = await fetch(`${origin}/auth/guest/start`, { method: "POST" });
const { token: jwt } = await jwtRes.json();
console.log(`\nTXLINE_API_ORIGIN=${origin}`);
console.log(`TXLINE_JWT=${jwt}`);

if (!txSig || !walletSignature) {
  console.log("\n(no txSig/signature supplied — got you a fresh guest JWT only)");
  console.log(`Sign this preimage with your subscribe wallet: <txSig>::<jwt above>`);
  process.exit(0);
}
const act = await fetch(`${origin}/api/token/activate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
  body: JSON.stringify({ txSig, walletSignature, leagues: [] }),
});
const data = await act.json();
console.log(`TXLINE_API_TOKEN=${data.token ?? JSON.stringify(data)}`);
