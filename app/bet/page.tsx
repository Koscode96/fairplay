"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { decodeBet, BetPayload } from "../../lib/bet-codec";
import { connectPhantom, signBetCommitment, shortKey, anchorOnDevnet } from "../../lib/phantom";

function BetInner() {
  const params = useSearchParams();
  const [bet, setBet] = useState<BetPayload | null>(null);
  const [bad, setBad] = useState(false);
  const [wallet, setWallet] = useState<string | null>(null);
  const [acceptSig, setAcceptSig] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ sig?: string; error?: string; busy?: boolean } | null>(null);
  const [result, setResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const d = params.get("d");
    if (!d) { setBad(true); return; }
    const b = decodeBet(d);
    if (!b) { setBad(true); return; }
    setBet(b);
  }, [params]);

  const checkSettlement = async () => {
    if (!bet) return;
    setChecking(true);
    try {
      const r = await fetch(`/api/settle-check?fixtureId=${bet.fixtureId}&marketId=${bet.marketId}${bet.line != null ? `&line=${bet.line}` : ""}`);
      setResult(await r.json());
    } catch { setResult({ outcome: "pending", note: "network error" }); }
    setChecking(false);
  };

  if (bad) return <div className="wrap"><p className="foot" style={{ marginTop: 80 }}>Invalid or corrupted challenge link.</p></div>;
  if (!bet) return <div className="wrap"><p className="foot" style={{ marginTop: 80 }}>OPENING CHALLENGE…</p></div>;

  const payout = (bet.stake * (bet.fairPrice - 1)).toFixed(2);
  const won = result?.outcome === "won";

  return (
    <div className="wrap">
      <div className="brand">
        <h1>FAIR<b>LINE</b></h1>
        <div className="net">P2P CHALLENGE ·{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); connectPhantom().then(setWallet); }}
             style={{ color: wallet ? "var(--won)" : "var(--dim)", textDecoration: "none" }}>
            {wallet ? shortKey(wallet) : "CONNECT PHANTOM"}
          </a>
        </div>
      </div>

      <p className="eyebrow">Open challenge · verified fair price</p>
      <div className="card chal">
        <div className="row"><span className="k">Market</span><span className="v">{bet.label}</span></div>
        <div className="row"><span className="k">Fair price (TxLINE)</span><span className="v">{bet.fairPrice.toFixed(2)}</span></div>
        <div className="row"><span className="k">Challenger backs</span><span className="v">YES · {shortKey(bet.creator)}</span></div>
        <div className="row"><span className="k">You take</span><span className="v">The other side</span></div>
        <div className="row"><span className="k">Stake each</span><span className="v">£{bet.stake.toFixed(2)}</span></div>
        <div className="row"><span className="k">Winner takes</span><span className="v">£{(bet.stake + Number(payout)).toFixed(2)}</span></div>
        <div className="row"><span className="k">Settlement</span><span className="v" style={{ fontSize: 11 }}>TxLINE verified · automatic</span></div>
        <div className="row"><span className="k">Status</span>
          <span className={`pill ${acceptSig ? "won" : "open"}`}>{acceptSig ? "ACCEPTED · SIGNED" : "AWAITING YOUR SIGNATURE"}</span></div>
        {!acceptSig && (
          <button className="go" style={{ marginTop: 12 }} onClick={async () => {
            if (!wallet) { const w = await connectPhantom(); setWallet(w); if (!w) return; }
            const sig = await signBetCommitment({ accept: true, of: bet.creatorSig.slice(0, 32), market: bet.marketId, fixture: bet.fixtureId, price: bet.fairPrice, ts: Date.now() });
            if (sig) setAcceptSig(sig);
          }}>
            {wallet ? "ACCEPT & SIGN WITH PHANTOM" : "CONNECT PHANTOM TO ACCEPT"}
          </button>
        )}
        {acceptSig && !anchor?.sig && (
          <button className="cta" style={{ marginTop: 10 }} disabled={anchor?.busy}
            onClick={async () => {
              setAnchor({ busy: true });
              const res = await anchorOnDevnet({ app: "fairline", accept: bet.creatorSig.slice(0, 24), fixture: bet.fixtureId, market: bet.marketId });
              setAnchor(res as any);
            }}>
            {anchor?.busy ? "ANCHORING…" : "ANCHOR ACCEPTANCE ON DEVNET →"}
          </button>
        )}
        {anchor?.error && <p className="foot" style={{ color: "var(--lost)", marginTop: 8 }}>{anchor.error}</p>}
        {anchor?.sig && (
          <div className="proofbox" style={{ marginTop: 10 }}>
            <b>ON-CHAIN · DEVNET</b><br />
            <a href={`https://explorer.solana.com/tx/${anchor.sig}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ color: "var(--won)" }}>view on Solana Explorer ↗</a>
          </div>
        )}
      </div>

      {acceptSig && (
        <>
          <p className="eyebrow" style={{ marginTop: 20 }}>Settlement · live from TxLINE</p>
          <div className="card">
            <button className="go" onClick={checkSettlement} disabled={checking}>
              {checking ? "CHECKING VERIFIED RESULT…" : "CHECK SETTLEMENT →"}
            </button>
            {result && (
              <div className="proofbox" style={{ marginTop: 12 }}>
                <b>OUTCOME: {String(result.outcome).toUpperCase()}{result.finalised === false && result.outcome === "pending" ? " (match not finalised)" : ""}</b><br />
                {result.score && <>score : {result.score.home}-{result.score.away}<br /></>}
                {result.seq != null && <>seq&nbsp;&nbsp;&nbsp;: {result.seq} · proof {result.proof}<br /></>}
                {result.outcome !== "pending" && (
                  <>ruling : challenger {won ? "WINS" : result.outcome === "void" ? "· VOID, stakes returned" : "LOSES · you win"}</>
                )}
              </div>
            )}
          </div>
        </>
      )}
      <p className="foot">Both wallets sign. Solana records it.<br />TxODDS verified data settles it. No bookmaker.</p>
    </div>
  );
}

export default function BetPage() {
  return <Suspense fallback={<div className="wrap"><p className="foot" style={{ marginTop: 80 }}>OPENING CHALLENGE…</p></div>}><BetInner /></Suspense>;
}
