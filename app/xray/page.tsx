"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { xray, type Leg } from "../../lib/engine";
import { settle } from "../../lib/markets";
import { settledStats, eventTimeline, txStatus } from "../../lib/txline";
import { connectPhantom, signBetCommitment, shortKey, anchorOnDevnet } from "../../lib/phantom";
import { encodeBet } from "../../lib/bet-codec";

interface SlipLeg extends Leg {
  sub: string;
  matched: boolean;
}

const DEMO_SLIP: SlipLeg[] = [
  { fixtureId: "wc-qf1", marketId: "home_win", label: "France to beat Brazil", sub: "QF · Match result", bookiePrice: 2.25, fairPrice: 2.42, proofRef: "sol:qf1hw…7c", matched: true },
  { fixtureId: "wc-qf2", marketId: "home_win", label: "England to beat Argentina", sub: "QF · Match result", bookiePrice: 2.6, fairPrice: 2.85, proofRef: "sol:qf2hw…7c", matched: true },
  { fixtureId: "wc-sf1", marketId: "btts", label: "France v Spain · BTTS", sub: "SF · Both teams to score", bookiePrice: 1.8, fairPrice: 1.92, proofRef: "sol:sf1bt…7c", matched: true },
  { fixtureId: "wc-sf1", marketId: "over_corners", label: "France v Spain · Over 9.5 corners", sub: "SF · Corners", bookiePrice: 1.87, fairPrice: 2.02, proofRef: "sol:sf1co…7c", matched: true },
];

export default function Page() {
  const [step, setStep] = useState(0);
  const [slip, setSlip] = useState<SlipLeg[]>(DEMO_SLIP);
  const [accaOverride, setAccaOverride] = useState<number | null>(null);
  const [splash, setSplash] = useState(true);
  const [anchor, setAnchor] = useState<{ sig?: string; error?: string; busy?: boolean } | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [stake, setStake] = useState(10);
  const [wallet, setWallet] = useState<string | null>(null);
  const [live, setLive] = useState<{ configured: boolean; network?: string }>({ configured: false });
  const [betSig, setBetSig] = useState<string | null>(null);
  const [scanOn, setScanOn] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [slipLoading, setSlipLoading] = useState(true);
  const [board, setBoard] = useState<any[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { txStatus().then(setLive); }, []);

  useEffect(() => {
    fetch("/api/live-slip")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.live && d.legs?.length) {
          setSlip(d.legs.map((l: any) => ({ ...l, fairPrice: l.fairPrice ?? 0 })));
          setAccaOverride(null);
        }
      })
      .catch(() => {})
      .finally(() => setSlipLoading(false));
    fetch("/api/market-board").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.live) setBoard(d.fixtures); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setSplash(false); return; }
    const t = setTimeout(() => setSplash(false), 2900);
    return () => clearTimeout(t);
  }, []);

  const matchedLegs = useMemo(() => slip.filter((l) => l.matched && l.fairPrice), [slip]);
  const legsProduct = useMemo(
    () => matchedLegs.reduce((a, l) => a * l.bookiePrice, 1),
    [matchedLegs]
  );
  const accaPrice = accaOverride ?? Number(legsProduct.toFixed(2));
  const r = useMemo(
    () => (matchedLegs.length ? xray(matchedLegs, accaPrice, stake) : null),
    [matchedLegs, accaPrice, stake]
  );
  const worst = r ? matchedLegs[r.worstLegIndex] : null;
  const settled = "won";
  const events = [
    { min: 34, type: "yellow", detail: "Yellow · De Paul (ARG)" },
    { min: 58, type: "goal", detail: "GOAL 0–1 · Enzo Fernandez (ARG)" },
    { min: 74, type: "goal", detail: "GOAL 1–1 · Gordon (ENG)" },
    { min: 91, type: "goal", detail: "GOAL 1–2 · L. Martinez header (ARG)" },
  ];

  const addLeg = (fixtureId: string, marketId: string, line: number | undefined, label: string, fair: number) => {
    const key = `${fixtureId}:${marketId}:${line ?? ""}`;
    setSlip((s) => {
      if (s.some((l) => `${l.fixtureId}:${l.marketId}:${(l as any).line ?? ""}` === key)) return s;
      const cleaned = s.filter((l) => l.matched);
      return [...cleaned, {
        fixtureId, marketId, line, label,
        sub: `LIVE · fair ${fair.toFixed(2)} · from market board`,
        bookiePrice: Number((fair * 0.94).toFixed(2)), fairPrice: fair,
        proofRef: "tx:board", matched: true,
      } as any];
    });
    setAccaOverride(null);
  };

  const shareText = async (text: string, url: string) => {
    try {
      if (navigator.share) { await navigator.share({ title: "Fairline", text, url }); return true; }
    } catch {}
    try { await navigator.clipboard.writeText(`${text} ${url}`); return "copied"; } catch { return false; }
  };
  const [shared, setShared] = useState<string | null>(null);

  const runScan = () => {
    if (!r) return;
    setStep(1); setScanOn(false); setTimeout(() => setScanOn(true), 60);
  };

  const onFile = async (f: File) => {
    setScanning(true); setScanMsg(null);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const rd = new FileReader();
        rd.onload = () => res((rd.result as string).split(",")[1]);
        rd.onerror = () => rej(new Error("read failed"));
        rd.readAsDataURL(f);
      });
      const resp = await fetch("/api/parse-slip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, mediaType: f.type || "image/png" }),
      });
      const data = await resp.json();
      if (!resp.ok) { setScanMsg(data.error ?? "Could not read that slip · try a clearer screenshot."); return; }
      const legs: SlipLeg[] = (data.legs ?? []).map((l: any) => ({
        fixtureId: l.fixtureId ?? "unmatched",
        marketId: l.marketId,
        label: l.selection || `${l.homeTeam} v ${l.awayTeam}`,
        sub: l.matched
          ? `${l.homeTeam} v ${l.awayTeam} · fair ${Number(l.fairPrice).toFixed(2)}`
          : "Not priced by StablePrice (active: match result, goal totals, handicaps) · excluded",
        bookiePrice: l.bookiePrice ?? 2,
        fairPrice: l.fairPrice ?? 0,
        proofRef: l.proofRef ?? undefined,
        matched: l.matched,
      }));
      if (!legs.length) { setScanMsg("No legs found on that image."); return; }
      setSlip(legs);
      setAccaOverride(data.accaPrice ?? null);
      if (data.stake) setStake(data.stake);
      setScanMsg(`Read ${legs.length} legs · ${data.matchedCount} matched to TxLINE markets.`);
    } catch {
      setScanMsg("Scan failed · check connection and try again.");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="wrap">
      {splash && (
        <div className="splash" onClick={() => setSplash(false)}>
          <div className="wordmark">
            {"FAIRPLAY".split("").map((c, i) => (
              <span key={i} className="l" style={{ animationDelay: `${i * 0.05}s`, color: i > 3 ? "var(--margin)" : undefined }}>{c}</span>
            ))}
            <span className="sweep" />
            <span className="tag">P2P FAIR ODDS · TxODDS · SOLANA</span>
          </div>
        </div>
      )}
      <div className="brand">
        <h1><a href="/" style={{ color: "inherit", textDecoration: "none" }}>FAIR<b>PLAY</b></a></h1>
        <div className="net">
          <a href="/" style={{ color: "var(--dim)", textDecoration: "none" }}>OPEN BETS</a>{" · "}{live.configured ? `TxLINE LIVE · ${live.network?.toUpperCase()}` : "DEMO"}
          {" · "}
          <a href="#" onClick={(e) => { e.preventDefault(); connectPhantom().then(setWallet); }}
             style={{ color: wallet ? "var(--won)" : "var(--dim)", textDecoration: "none" }}>
            {wallet ? shortKey(wallet) : "CONNECT PHANTOM"}
          </a>
        </div>
      </div>

      <div className="layout">
      <div>
      <div className="steps">
        {["1 · SLIP", "2 · X-RAY", "3 · FAIR BET"].map((t, i) => (
          <button key={t} className={step === i ? "on" : ""} onClick={() => (i === 1 ? runScan() : setStep(i))}>{t}</button>
        ))}
      </div>

      {step === 0 && (
        <section>
          <p className="eyebrow">{slip[0]?.sub?.startsWith("LIVE") ? "Step 1 · Your bet · live World Cup markets" : "Step 1 · Your bet"}</p>
          <p className="foot" style={{ textAlign: "left", margin: "0 2px 12px", color: "var(--dim)" }}>
            Bookies bake hidden margin into every price. Build a slip below or scan yours · we&rsquo;ll show what you&rsquo;re really paying.
          </p>
          {scanMsg && <p className="foot" style={{ marginTop: 0, marginBottom: 12 }}>{scanMsg}</p>}
          {slipLoading && (
            <div className="card" style={{ textAlign: "center", padding: "34px 16px" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".14em", color: "var(--margin)" }}>
                CONNECTING TO TXLINE FEED…
              </span>
            </div>
          )}
          {!slipLoading && <div className="card">
            {slip.map((l, i) => (
              <div className={`leg ${l.matched ? "" : "unmatched"}`} key={`${l.label}-${i}`}>
                <div className="m">{l.label}<span>{l.sub}</span></div>
                <input className="num" type="number" step="0.01" value={l.bookiePrice}
                  disabled={!l.matched}
                  onChange={(e) =>
                    setSlip(slip.map((s, j) => (j === i ? { ...s, bookiePrice: +e.target.value || s.bookiePrice } : s)))
                  } />
              </div>
            ))}
            <div className="totrow">
              <label>Bookie&rsquo;s acca price
                <button className={`autochip ${accaOverride === null ? "on" : ""}`}
                  onClick={() => setAccaOverride(null)}
                  title="Auto = product of the legs above">
                  {accaOverride === null ? "AUTO ✓" : "RESET TO AUTO"}
                </button>
              </label>
              <input className="num" type="number" step="0.01" value={accaPrice}
                onChange={(e) => setAccaOverride(+e.target.value || null)} /></div>
            <div className="totrow"><label>Stake (£)</label>
              <input className="num" type="number" step="1" value={stake} onChange={(e) => setStake(+e.target.value || stake)} /></div>
            <button className="go" onClick={runScan} disabled={!r}>RUN X-RAY →</button>
          </div>}
          <p className="foot">Tap prices on the live board to build your bet.<br />Fair prices from TxLINE StablePrice consensus.</p>
        </section>
      )}

      {step === 1 && r && (
        <section>
          <div className="card verdict">
            <p className="eyebrow" style={{ marginLeft: 0 }}>Margin X-ray</p>
            <div className="big">{r.accaMarginPct.toFixed(1)}<small>%</small></div>
            <p>is what this acca charges you above the verified fair price.<br />
              <b>£{stake.toFixed(0)} staked → expected value −£{Math.abs(r.expectedValueAbs).toFixed(2)}.</b></p>
            <div className="kv">
              <div><div className="k">Their price</div><div className="v">{r.accaBookiePrice.toFixed(2)}</div></div>
              <div><div className="k">Fair price</div><div className="v">{r.accaFairPrice.toFixed(2)}</div></div>
              <div><div className="k">EV / £{stake.toFixed(0)}</div><div className="v neg">−£{Math.abs(r.expectedValueAbs).toFixed(2)}</div></div>
            </div>
          </div>
          <p className="eyebrow">Per-leg scan</p>
          <div className="card">
            {r.legs.map((l, i) => {
              const fairW = l.fairProb * 100;
              const skimW = (l.bookieImpliedProb - l.fairProb) * 100;
              return (
                <div className="scanleg" key={`${l.label}-${i}`}>
                  <div className="top">
                    <div className={`lbl ${i === r.worstLegIndex ? "worst" : ""}`}>{l.label}{i === r.worstLegIndex ? " ← worst leg" : ""}</div>
                    <div className="pm">+{l.marginPct.toFixed(1)}%</div>
                  </div>
                  <div className="bar">
                    <div className="fair" style={{ width: scanOn ? `${fairW}%` : 0 }} />
                    <div className="skim" style={{ left: `${fairW}%`, width: scanOn ? `${Math.max(skimW, 0)}%` : 0 }} />
                  </div>
                  <div className="sub"><span>theirs {l.bookiePrice.toFixed(2)} · fair {l.fairPrice.toFixed(2)}</span>
                    <a href="#" onClick={(e) => e.preventDefault()}>{l.proofRef ?? "proof"} ↗</a></div>
                </div>
              );
            })}
          </div>
          <div className="legend">
            <span><span className="sw" style={{ background: "#2E4160" }} />FAIR PRICE</span>
            <span><span className="sw" style={{ background: "repeating-linear-gradient(-55deg,var(--margin) 0 3px,transparent 3px 6px)" }} />MARGIN SKIMMED</span>
          </div>
          <div style={{ height: 16 }} />
          <button className="cta" onClick={() => setStep(2)}>TAKE WORST LEG AT FAIR ODDS ON FAIRPLAY →</button>
          <button className="go" style={{ marginTop: 10 }} onClick={async () => {
            const t = `My acca: bookie ${r.accaBookiePrice.toFixed(2)} vs fair ${r.accaFairPrice.toFixed(2)}. Paying ${r.accaMarginPct.toFixed(1)}% margin, EV ${r.expectedValueAbs < 0 ? "-" : ""}£${Math.abs(r.expectedValueAbs).toFixed(2)} on £${stake}. X-rayed on Fairline.`;
            const res = await shareText(t, window.location.origin);
            setShared(res === "copied" ? "COPIED TO CLIPBOARD ✓" : res ? "SHARED ✓" : null);
            setTimeout(() => setShared(null), 2200);
          }}>{shared ?? "SHARE MY X-RAY"}</button>
          <p className="foot">Every fair price carries an on-chain timestamp proof.<br />Solana-anchored via TxLINE Merkle attestation.</p>
        </section>
      )}

      {step === 2 && worst && (
        <section>
          <p className="eyebrow">Your challenge · live on the board once signed</p>
          <div className="card chal">
            <div className="row"><span className="k">Market</span><span className="v">{worst.label.split("·").pop()?.trim()}</span></div>
            <div className="row"><span className="k">Your price (fair)</span><span className="v">{worst.fairPrice.toFixed(2)}</span></div>
            <div className="row"><span className="k">Bookie wanted</span><span className="v" style={{ color: "var(--faint)", textDecoration: "line-through" }}>{worst.bookiePrice.toFixed(2)}</span></div>
            <div className="row"><span className="k">Stake</span><span className="v">£10.00</span></div>
            <div className="row"><span className="k">Settlement</span><span className="v" style={{ fontSize: 11 }}>TxLINE verified · auto</span></div>
            <div className="row"><span className="k">Status</span>
              <span className={`pill ${betSig ? "won" : "open"}`}>{betSig ? "LIVE ON FAIRPLAY · AWAITING TAKER" : "AWAITING YOUR SIGNATURE"}</span></div>
            {!betSig && (
              <button className="go" style={{ marginTop: 12 }} onClick={async () => {
                let w = wallet;
                if (!w) { w = await connectPhantom(); setWallet(w); if (!w) return; }
                const terms = { app: "fairplay", v: 1, market: worst.marketId, fixture: worst.fixtureId, price: worst.fairPrice, stake: 10, side: "for", ts: Date.now() };
                const sig = await signBetCommitment(terms);
                if (sig && w) {
                  setBetSig(sig);
                  const d = encodeBet({
                    v: 1, fixtureId: worst.fixtureId, marketId: worst.marketId,
                    line: (worst as any).line, label: worst.label, fairPrice: worst.fairPrice,
                    stake: 10, creator: w, creatorSig: sig, side: "for", ts: terms.ts,
                  });
                  setShareLink(`${window.location.origin}/bet?d=${d}`);
                  fetch("/api/bets", { method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ d, label: worst.label, fairPrice: worst.fairPrice, stake: 10, creator: w }) }).catch(() => {});
                }
              }}>
                {wallet ? "SIGN CHALLENGE WITH PHANTOM" : "CONNECT PHANTOM TO SIGN"}
              </button>
            )}
            {betSig && <div className="proofbox" style={{ marginTop: 12 }}><b>WALLET COMMITMENT</b><br />sig: {betSig.slice(0, 44)}…</div>}
            {shareLink && (
              <button className="go" style={{ marginTop: 10 }}
                onClick={() => { navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                {copied ? "LINK COPIED ✓" : "COPY CHALLENGE LINK →"}
              </button>
            )}
            {shareLink && (
              <button className="cta" style={{ marginTop: 8 }} onClick={async () => {
                const t = `Take the other side: ${worst.label} @ fair ${worst.fairPrice.toFixed(2)}, £10. Settled by TxODDS verified data on Fairline.`;
                const res = await shareText(t, shareLink);
                setShared(res === "copied" ? "COPIED ✓" : res ? "SHARED ✓" : null);
                setTimeout(() => setShared(null), 2200);
              }}>{shared ?? "SHARE CHALLENGE TO SOCIALS →"}</button>
            )}
            {betSig && !anchor?.sig && (
              <button className="cta" style={{ marginTop: 10 }} disabled={anchor?.busy}
                onClick={async () => {
                  setAnchor({ busy: true });
                  const res = await anchorOnDevnet({
                    app: "fairline", market: worst.marketId, fixture: worst.fixtureId,
                    price: worst.fairPrice, commit: betSig.slice(0, 32),
                  });
                  setAnchor(res as any);
                }}>
                {anchor?.busy ? "ANCHORING…" : "ANCHOR BET ON SOLANA DEVNET →"}
              </button>
            )}
            {anchor?.error && <p className="foot" style={{ color: "var(--lost)", marginTop: 8 }}>{anchor.error}</p>}
            {anchor?.sig && (
              <div className="proofbox" style={{ marginTop: 10 }}>
                <b>ON-CHAIN · DEVNET</b><br />
                tx: {anchor.sig.slice(0, 40)}…<br />
                <a href={`https://explorer.solana.com/tx/${anchor.sig}?cluster=devnet`} target="_blank" rel="noreferrer"
                   style={{ color: "var(--won)" }}>view on Solana Explorer ↗</a>
              </div>
            )}
          </div>

          <p className="eyebrow" style={{ marginTop: 20 }}>Settled example · England v Argentina SF</p>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13.5 }}>Argentina to win (90 mins) <span style={{ color: "var(--dim)" }}>fixture 18241006</span></div>
              <span className="pill won">{settled.toUpperCase()} · SETTLED</span>
            </div>
            <div className="tlrow tl">
              <div className="axis">
                {events.map((e) => (
                  <div key={e.min}>
                    <div className={`tick ${e.type === "goal" ? "goal" : ""} ${e.min === 83 ? "key" : ""}`} style={{ left: `${(e.min / 90) * 100}%` }} />
                    {(e.type === "goal" || e.min === 83) && <div className="lab" style={{ left: `${(e.min / 90) * 100}%` }}>{e.min}&rsquo;</div>}
                  </div>
                ))}
              </div>
            </div>
            <div className="evlist">
              {events.map((e) => (
                <div key={e.min} className={e.min === 83 ? "key" : ""}>{String(e.min).padStart(2, "0")}&rsquo; · {e.detail}</div>
              ))}
            </div>
            <div className="proofbox">
              <b>SETTLEMENT CERTIFICATE #FL-0001</b><br />
              predicate : goals(away) − goals(home) &gt; 0 → 2−1 ✓<br />
              phase&nbsp;&nbsp;&nbsp;&nbsp;: game_finalised (StatusId 100) · seq 962<br />
              fixture&nbsp;&nbsp;: 18241006 · England v Argentina · WC SF<br />
              source&nbsp;&nbsp;&nbsp;: /scores/stat-validation?fixtureId=18241006<br />
              verified : TxLINE Merkle proof · Solana-anchored
            </div>
          </div>
          <p className="foot">Abandoned or postponed match? Rule-based VOID,<br />stakes returned, certificate issued. No disputes.</p>
        </section>
      )}
      </div>
      <div className="boardcol">
        <p className="eyebrow">Live TxLINE markets · tap a price to add</p>
        <div className="card">
          {!board && <p className="mknote">CONNECTING TO FEED…</p>}
          {board?.map((f: any) => {
            const ko = new Date(f.startTime).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
            return (
              <div className="mkfix" key={f.fixtureId}>
                <div className="mkhead"><div>{f.home} v {f.away}</div><span>KO {ko}</span></div>
                <div className="mkrow">
                  <span className="mklabel">RESULT</span>
                  {f.oneX2.home && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "home_win", undefined, `${f.home} to beat ${f.away}`, f.oneX2.home)}><small>1</small>{f.oneX2.home.toFixed(2)}</button>}
                  {f.oneX2.draw && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "draw", undefined, `${f.home} v ${f.away} · Draw`, f.oneX2.draw)}><small>X</small>{f.oneX2.draw.toFixed(2)}</button>}
                  {f.oneX2.away && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "away_win", undefined, `${f.away} to beat ${f.home}`, f.oneX2.away)}><small>2</small>{f.oneX2.away.toFixed(2)}</button>}
                </div>
                {f.goals.filter((g: any) => g.over || g.under).slice(0, 4).map((g: any) => (
                  <div className="mkrow" key={`g${g.line}`}>
                    <span className="mklabel">GOALS {g.line}</span>
                    {g.over && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "over_goals", g.line, `${f.home} v ${f.away} · Over ${g.line} goals`, g.over)}><small>O</small>{g.over.toFixed(2)}</button>}
                    {g.under && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "under_goals", g.line, `${f.home} v ${f.away} · Under ${g.line} goals`, g.under)}><small>U</small>{g.under.toFixed(2)}</button>}
                  </div>
                ))}
                {f.handicap.filter((h: any) => h.home).slice(0, 3).map((h: any) => (
                  <div className="mkrow" key={`h${h.line}`}>
                    <span className="mklabel">AH {h.line}</span>
                    <button className="mkpx" onClick={() => addLeg(f.fixtureId, "home_handicap", h.line, `${f.home} ${h.line >= 0 ? "+" : ""}${h.line} v ${f.away}`, h.home)}><small>1</small>{h.home.toFixed(2)}</button>
                  </div>
                ))}
              </div>
            );
          })}
          <p className="mknote">StablePrice de-margined consensus · devnet<br />Priced: match result · goal totals · handicaps<br />Not priced: BTTS · corners · cards</p>
        </div>
      </div>
      </div>
    </div>
  );
}
