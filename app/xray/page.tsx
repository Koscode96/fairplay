"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { xray, type Leg } from "../../lib/engine";
import { settle } from "../../lib/markets";
import { settledStats, eventTimeline, txStatus } from "../../lib/txline";
import { connectPhantom, signBetCommitment, shortKey, anchorOnDevnet } from "../../lib/phantom";
import { encodeBet } from "../../lib/bet-codec";
import { flag } from "../../lib/flags";

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
  const [slip, setSlip] = useState<SlipLeg[]>([]);
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
          setSlip(d.legs.map((l: any) => ({ ...l, bookiePrice: l.fairPrice ?? l.bookiePrice, fairPrice: l.fairPrice ?? 0 })));
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
  const [chosen, setChosen] = useState(0);
  const [postMode, setPostMode] = useState<"combo" | "single">("combo");
  const comboPrice = Number(matchedLegs.reduce((a, l) => a * l.fairPrice, 1).toFixed(2));
  const worst = matchedLegs.length ? matchedLegs[Math.min(chosen, matchedLegs.length - 1)] : null;
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
        fixtureId, marketId, line, label, ko: (board?.find((f: any) => f.fixtureId === fixtureId)?.startTime) ?? null,
        sub: `LIVE · fair ${fair.toFixed(2)} · from market board`,
        bookiePrice: fair, fairPrice: fair,
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
          : "No fair price available for this market yet",
        bookiePrice: l.bookiePrice ?? 2,
        fairPrice: l.fairPrice ?? 0,
        proofRef: l.proofRef ?? undefined,
        matched: l.matched,
        ko: l.ko ?? null,
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
            <span className="tag">BET ANYONE · FAIR ODDS · NO BOOKIE</span>
          </div>
        </div>
      )}
      <div className="brand">
        <h1><a href="/" style={{ color: "inherit", textDecoration: "none" }}>FAIR<b>PLAY</b></a></h1>
        <div className="net">
          <a href="/" style={{ color: "var(--dim)", textDecoration: "none" }}>OPEN BETS</a>{" · "}{live.configured ? "LIVE ODDS · VERIFIED" : "DEMO MODE"}
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
        {["1 · PICK MARKETS", "2 · TERMS & POST"].map((t, i) => (
          <button key={t} className={step === (i === 1 ? 2 : 0) ? "on" : ""} onClick={() => setStep(i === 1 ? 2 : 0)}>{t}</button>
        ))}
      </div>

      {step === 0 && (
        <section>
          <p className="eyebrow">{slip[0]?.sub?.startsWith("LIVE") ? "Step 1 · Your bet · live World Cup markets" : "Step 1 · Your bet"}</p>
          
          {scanMsg && <p className="foot" style={{ marginTop: 0, marginBottom: 12 }}>{scanMsg}</p>}
          {slipLoading && (
            <div className="card" style={{ textAlign: "center", padding: "34px 16px" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".14em", color: "var(--margin)" }}>
                LOADING LIVE ODDS…
              </span>
            </div>
          )}
          {!slipLoading && slip.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "30px 16px" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".1em", color: "var(--dim)" }}>
                EMPTY SLIP · TAP A PRICE ON THE LIVE BOARD →
              </span>
            </div>
          )}
          {!slipLoading && slip.length > 0 && <div className="card">
            {slip.map((l, i) => (
              <div className={`leg ${l.matched ? "" : "unmatched"}`} key={`${l.label}-${i}`}>
                <div className="m">{l.label}<span>{l.sub}</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="num" style={{ fontFamily: "var(--mono)", fontSize: 14 }}>{l.fairPrice.toFixed(2)}</span>
                  <button className="mkpx" style={{ padding: "4px 8px" }} title="Remove"
                    onClick={() => setSlip(slip.filter((_, j) => j !== i))}>×</button>
                </div>
              </div>
            ))}
            

            <button className="go" onClick={() => matchedLegs.length && setStep(2)} disabled={!matchedLegs.length}>CHOOSE MARKET & SET TERMS →</button>
          </div>}
          <p className="foot">Challenges post to the open board at the fair price.<br />Fair odds verified by TxODDS.</p>
        </section>
      )}

      

      {step === 2 && worst && (
        <section>
          <p className="eyebrow">Set your terms, sign to post</p>
          {matchedLegs.length > 1 && (
            <div className="mkrow" style={{ marginBottom: 10 }}>
              <button className="mkpx" style={postMode === "combo" ? { borderColor: "var(--margin)", color: "var(--margin)" } : {}}
                onClick={() => setPostMode("combo")}>COMBO · {matchedLegs.length} LEGS @ {comboPrice.toFixed(2)}</button>
              <button className="mkpx" style={postMode === "single" ? { borderColor: "var(--margin)", color: "var(--margin)" } : {}}
                onClick={() => setPostMode("single")}>SINGLES · PICK ONE</button>
            </div>
          )}
          {postMode === "single" && matchedLegs.length > 1 && (
            <div className="mkrow" style={{ marginBottom: 10, flexWrap: "wrap" }}>
              {matchedLegs.map((l, i) => (
                <button key={i} className="mkpx" style={i === Math.min(chosen, matchedLegs.length - 1) ? { borderColor: "var(--margin)", color: "var(--margin)" } : {}}
                  onClick={() => setChosen(i)}>{l.label.slice(0, 26)} · {l.fairPrice.toFixed(2)}</button>
              ))}
            </div>
          )}
          <div className="card chal">
            <div className="row"><span className="k">Market</span><span className="v">{worst.label.split("·").pop()?.trim()}</span></div>
            <div className="row"><span className="k">{postMode === "combo" && matchedLegs.length > 1 ? "Combined price · legs multiplied" : "Fair price"}</span>
              <span className="v">{(postMode === "combo" && matchedLegs.length > 1 ? comboPrice : worst.fairPrice).toFixed(2)}</span></div>
                        <div className="totrow" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
              <label>Your stake (£)</label>
              <input className="num" type="number" min={1} step={1} value={stake}
                onChange={(e) => setStake(Math.max(1, +e.target.value || 1))} style={{ width: 90 }} />
            </div>
            <div className="row"><span className="k">You win</span><span className="v">£{(stake * ((postMode === "combo" && matchedLegs.length > 1 ? comboPrice : worst.fairPrice) - 1)).toFixed(2)}</span></div>
            <div className="row"><span className="k">Takers fill</span><span className="v">from £1 · up to £{(stake * ((postMode === "combo" && matchedLegs.length > 1 ? comboPrice : worst.fairPrice) - 1)).toFixed(2)}</span></div>
            <div className="row"><span className="k">Settlement</span><span className="v" style={{ fontSize: 11 }}>Automatic · official result</span></div>
            <div className="row"><span className="k">Status</span>
              <span className={`pill ${betSig ? "won" : "open"}`}>{betSig ? "LIVE ON FAIRPLAY · AWAITING TAKER" : "AWAITING YOUR SIGNATURE"}</span></div>
            {!betSig && (
              <button className="go" style={{ marginTop: 12 }} onClick={async () => {
                let w = wallet;
                if (!w) { w = await connectPhantom(); setWallet(w); if (!w) return; }
                const isCombo = postMode === "combo" && matchedLegs.length > 1;
                const effPrice = isCombo ? comboPrice : worst.fairPrice;
                const effLabel = isCombo ? `Combo · ${matchedLegs.map((l) => l.label).join(" + ")}` : worst.label;
                const terms = { app: "fairplay", v: 1, market: isCombo ? "combo" : worst.marketId, fixture: worst.fixtureId, price: effPrice, stake, side: "for", ts: Date.now() };
                const sig = await signBetCommitment(terms);
                if (sig && w) {
                  setBetSig(sig);
                  const d = encodeBet({
                    v: 1, fixtureId: worst.fixtureId, marketId: isCombo ? "combo" : worst.marketId,
                    line: (worst as any).line, label: effLabel, fairPrice: effPrice,
                    legs: isCombo ? matchedLegs.map((l) => ({ label: l.label, marketId: l.marketId, line: (l as any).line, fairPrice: l.fairPrice, fixtureId: l.fixtureId })) : undefined,
                    stake, creator: w, creatorSig: sig, side: "for", ts: terms.ts,
                  });
                  setShareLink(`${window.location.origin}/bet?d=${d}`);
                  fetch("/api/bets", { method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ d, label: effLabel, fairPrice: effPrice, stake, creator: w, ko: (worst as any).ko ?? null }) }).catch(() => {});
                }
              }}>
                {wallet ? "SIGN CHALLENGE WITH PHANTOM" : "CONNECT PHANTOM TO SIGN"}
              </button>
            )}
            {betSig && <div className="proofbox" style={{ marginTop: 12 }}><b>SIGNED WITH YOUR WALLET ✓</b></div>}
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
                {anchor?.busy ? "RECORDING…" : "RECORD BET ON-CHAIN →"}
              </button>
            )}
            {anchor?.error && <p className="foot" style={{ color: "var(--lost)", marginTop: 8 }}>{anchor.error}</p>}
            {anchor?.sig && (
              <div className="proofbox" style={{ marginTop: 10 }}>
                <b>RECORDED ON-CHAIN ✓</b><br />
                tx: {anchor.sig.slice(0, 40)}…<br />
                <a href={`https://explorer.solana.com/tx/${anchor.sig}?cluster=devnet`} target="_blank" rel="noreferrer"
                   style={{ color: "var(--won)" }}>view proof ↗</a>
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
                <div className="mkhead"><div>{f.home} v {f.away}</div><span>{f.showcase ? "FINAL · FT · fair odds pre-KO" : `KO ${ko}`}</span></div>
                <div className="mkrow">
                  <span className="mklabel">RESULT</span>
                  {f.oneX2.home && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "home_win", undefined, `${f.home} to beat ${f.away}`, f.oneX2.home)}><small>{flag(f.home)}</small>{f.oneX2.home.toFixed(2)}</button>}
                  {f.oneX2.draw && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "draw", undefined, `${f.home} v ${f.away} · Draw`, f.oneX2.draw)}><small>X</small>{f.oneX2.draw.toFixed(2)}</button>}
                  {f.oneX2.away && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "away_win", undefined, `${f.away} to beat ${f.home}`, f.oneX2.away)}><small>{flag(f.away)}</small>{f.oneX2.away.toFixed(2)}</button>}
                </div>
                {f.goals.filter((g: any) => g.over || g.under).slice(0, 4).map((g: any) => (
                  <div className="mkrow" key={`g${g.line}`}>
                    <span className="mklabel">GOALS {g.line}</span>
                    {g.over && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "over_goals", g.line, `${f.home} v ${f.away} · Over ${g.line} goals`, g.over)}><small>O</small>{g.over.toFixed(2)}</button>}
                    {g.under && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "under_goals", g.line, `${f.home} v ${f.away} · Under ${g.line} goals`, g.under)}><small>U</small>{g.under.toFixed(2)}</button>}
                  </div>
                ))}
                {f.handicap.filter((h: any) => h.home || h.away).slice(0, 4).map((h: any) => (
                  <div className="mkrow" key={`h${h.line}`}>
                    <span className="mklabel">AH {h.line}</span>
                    {h.home && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "home_handicap", h.line, `${f.home} ${h.line >= 0 ? "+" : ""}${h.line} v ${f.away}`, h.home)}><small>{flag(f.home)}</small>{h.home.toFixed(2)}</button>}
                    {h.away && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "away_handicap", -h.line, `${f.away} ${-h.line >= 0 ? "+" : ""}${-h.line} v ${f.home}`, h.away)}><small>{flag(f.away)}</small>{h.away.toFixed(2)}</button>}
                  </div>
                ))}
              </div>
            );
          })}
          <p className="mknote">Fair odds by TxODDS<br />Match result · total goals · handicaps<br />More markets coming</p>
        </div>
      </div>
      </div>
    </div>
  );
}
