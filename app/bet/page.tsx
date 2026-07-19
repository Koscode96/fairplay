"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { decodeBet, BetPayload } from "../../lib/bet-codec";
import { connectPhantom, signBetCommitment, shortKey, anchorOnDevnet } from "../../lib/phantom";

function BetInner() {
  const getWallet = () => {
    const w = (window as any).phantom?.solana ?? (window as any).solana;
    return w?.publicKey?.toBase58?.() ?? "unknown";
  };
  const params = useSearchParams();
  const [bet, setBet] = useState<BetPayload | null>(null);
  const [bad, setBad] = useState(false);
  const [wallet, setWallet] = useState<string | null>(null);
  const [acceptSig, setAcceptSig] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ sig?: string; error?: string; busy?: boolean } | null>(null);
  const [result, setResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [feedBet, setFeedBet] = useState<any>(null);
  const [fillAmt, setFillAmt] = useState<number>(10);
  const [myFill, setMyFill] = useState<number | null>(null);

  useEffect(() => {
    const d = params.get("d");
    if (!d) { setBad(true); return; }
    const b = decodeBet(d);
    if (!b) { setBad(true); return; }
    setBet(b);
    fetch(`/api/bets?d=${encodeURIComponent(d)}`).then((r) => r.json())
      .then((res) => { if (res.bet) { setFeedBet(res.bet); setFillAmt(Math.min(10, res.bet.remaining)); } })
      .catch(() => {});
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
        <h1>FAIR<b>PLAY</b></h1>
        <div className="net">P2P CHALLENGE ·{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); connectPhantom().then(setWallet); }}
             style={{ color: wallet ? "var(--won)" : "var(--dim)", textDecoration: "none" }}>
            {wallet ? shortKey(wallet) : "CONNECT PHANTOM"}
          </a>
        </div>
      </div>

      <p className="eyebrow">Open bet · fair odds</p>
      <div className="card chal">
        <div className="row"><span className="k">Market</span><span className="v">{bet.label}</span></div>
        <div className="row"><span className="k">Fair price</span><span className="v">{bet.fairPrice.toFixed(2)}</span></div>
        <div className="row"><span className="k">Challenger backs</span><span className="v">YES · {shortKey(bet.creator)}</span></div>
        <div className="row"><span className="k">You take</span><span className="v">The other side · from £1</span></div>
        {feedBet && (
          <div className="row"><span className="k">Liquidity</span>
            <span className="v">£{feedBet.matched} / £{feedBet.totalLiability} matched · £{feedBet.remaining} open</span></div>
        )}
        <div className="row"><span className="k">Stake each</span><span className="v">£{bet.stake.toFixed(2)}</span></div>
        <div className="row"><span className="k">Winner takes</span><span className="v">£{(bet.stake + Number(payout)).toFixed(2)}</span></div>
        <div className="row"><span className="k">Settlement</span><span className="v" style={{ fontSize: 11 }}>TxLINE verified · automatic</span></div>
        <div className="row"><span className="k">Status</span>
          <span className={`pill ${acceptSig ? "won" : "open"}`}>{acceptSig ? `MATCHED £${(myFill ?? 0).toFixed(0)} · SIGNED` : "OPEN"}</span></div>
        {feedBet?.closed && !acceptSig && (
          <p className="foot" style={{ marginTop: 10 }}>IN PLAY · CLOSED TO NEW TAKERS</p>
        )}
        {!acceptSig && !feedBet?.closed && (
          <>
            <div className="totrow" style={{ marginTop: 6 }}>
              <label>Your stake (£){feedBet ? ` · max ${feedBet.remaining}` : ""}</label>
              <input className="num" type="number" min={1} step={1} value={fillAmt}
                onChange={(e) => setFillAmt(Math.max(1, Math.min(feedBet?.remaining ?? 999, +e.target.value || 1)))} />
            </div>
            <p className="foot" style={{ textAlign: "left", margin: "6px 2px 0" }}>
              Risk £{fillAmt.toFixed(2)} to win £{(fillAmt / (bet.fairPrice - 1)).toFixed(2)}
              {feedBet?.totalLiability ? ` · ${((fillAmt / feedBet.totalLiability) * 100).toFixed(0)}% of the bet` : ""}
            </p>
            <button className="go" style={{ marginTop: 12 }} onClick={async () => {
              if (!wallet) { const w = await connectPhantom(); setWallet(w); if (!w) return; }
              const amt = fillAmt;
              const sig = await signBetCommitment({ accept: true, of: bet.creatorSig.slice(0, 32), market: bet.marketId, fixture: bet.fixtureId, price: bet.fairPrice, amount: amt, ts: Date.now() });
              if (sig) {
                setAcceptSig(sig); setMyFill(amt);
                const w2 = getWallet();
                fetch("/api/bets", { method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "fill", d: params.get("d"), taker: w2, amount: amt, sig }) })
                  .then((r) => r.json()).then((res) => { if (res.bet) setFeedBet(res.bet); }).catch(() => {});
              }
            }}>
              {wallet ? `MATCH £${fillAmt.toFixed(0)} & SIGN` : "CONNECT PHANTOM TO MATCH"}
            </button>
          </>
        )}
        {acceptSig && !anchor?.sig && (
          <button className="cta" style={{ marginTop: 10 }} disabled={anchor?.busy}
            onClick={async () => {
              setAnchor({ busy: true });
              const res = await anchorOnDevnet({ app: "fairline", accept: bet.creatorSig.slice(0, 24), fixture: bet.fixtureId, market: bet.marketId });
              setAnchor(res as any);
            }}>
            {anchor?.busy ? "RECORDING…" : "RECORD MY SIDE ON-CHAIN →"}
          </button>
        )}
        {anchor?.error && <p className="foot" style={{ color: "var(--lost)", marginTop: 8 }}>{anchor.error}</p>}
        {anchor?.sig && (
          <div className="proofbox" style={{ marginTop: 10 }}>
            <b>RECORDED ON-CHAIN ✓</b><br />
            <a href={`https://explorer.solana.com/tx/${anchor.sig}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ color: "var(--won)" }}>view proof ↗</a>
          </div>
        )}
      </div>

      {feedBet?.fills?.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="eyebrow" style={{ margin: "0 0 8px" }}>Takers</p>
          {feedBet.fills.map((f: any, i: number) => (
            <div className="row" key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, fontFamily: "var(--mono)" }}>
              <span style={{ color: "var(--dim)" }}>{shortKey(f.taker)}</span>
              <span>£{f.amount.toFixed(2)} · wins £{(f.amount / (bet.fairPrice - 1)).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      {acceptSig && (
        <>
          <p className="eyebrow" style={{ marginTop: 20 }}>Result</p>
          <div className="card">
            <button className="go" onClick={checkSettlement} disabled={checking}>
              {checking ? "CHECKING THE RESULT…" : "CHECK RESULT →"}
            </button>
            {result && (
              <div className="proofbox" style={{ marginTop: 12 }}>
                <b>OUTCOME: {String(result.outcome).toUpperCase()}{result.finalised === false && result.outcome === "pending" ? " (match not finalised)" : ""}</b><br />
                {result.score && <>score : {result.score.home}-{result.score.away}<br /></>}
                
                {result.outcome !== "pending" && (
                  <>ruling : challenger {won ? "WINS" : result.outcome === "void" ? "· VOID, stakes returned" : "LOSES · you win"}</>
                )}
              </div>
            )}
          </div>
        </>
      )}
      <p className="foot">Both sides sign. The result decides.<br />No bookmaker. No arguing.</p>
    </div>
  );
}

export default function BetPage() {
  return <Suspense fallback={<div className="wrap"><p className="foot" style={{ marginTop: 80 }}>OPENING CHALLENGE…</p></div>}><BetInner /></Suspense>;
}
