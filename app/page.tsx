"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { shortKey, connectPhantom } from "../lib/phantom";
import { flag } from "../lib/flags";
import Splash from "./splash";

export default function Home() {
  const [bets, setBets] = useState<any[] | null>(null);
  const [board, setBoard] = useState<any[] | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/bets").then((r) => r.json()).then((d) => setBets(d.bets ?? [])).catch(() => setBets([]));
    fetch("/api/market-board").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.live) setBoard(d.fixtures); }).catch(() => {});
  }, []);

  return (
    <div className="wrap">
      <Splash />
      <div className="brand">
        <h1><Link href="/" style={{ color: "inherit", textDecoration: "none" }}>FAIR<b>PLAY</b></Link></h1>
        <div className="net">
          <Link href="/xray" style={{ color: "var(--dim)", textDecoration: "none" }}>POST A CHALLENGE</Link>
          {" · "}
          <a href="#" onClick={(e) => { e.preventDefault(); connectPhantom().then(setWallet); }}
             style={{ color: wallet ? "var(--won)" : "var(--dim)", textDecoration: "none" }}>
            {wallet ? shortKey(wallet) : "CONNECT PHANTOM"}
          </a>
        </div>
      </div>

      <div className="hero" style={{ margin: "18px 0 20px" }}>
        <h2>Bet anyone. No bookmaker.</h2>
        <p>Back a World Cup bet at the verified fair price, or take the other side of someone else&rsquo;s from £1.
          The official result settles it automatically.</p>
      </div>

      <div className="mkrow" style={{ marginBottom: 20, gap: 10, flexWrap: "wrap" }}>
        <span className="mkpx" style={{ cursor: "default" }}>1 · POST AT FAIR ODDS</span>
        <span className="mkpx" style={{ cursor: "default" }}>2 · ANYONE FILLS FROM £1</span>
        <span className="mkpx" style={{ cursor: "default" }}>3 · RESULT SETTLES IT</span>
      </div>

      <div className="layout">
        <div>
          <p className="eyebrow">Open bets · take either side</p>
          <div className="card">
            {bets === null && <p className="mknote">LOADING…</p>}
            {bets?.length === 0 && (
              <div style={{ textAlign: "center", padding: "18px 8px" }}>
                <p style={{ fontSize: 14, marginBottom: 4 }}>The board is waiting for its first bet.</p>
                <p className="mknote" style={{ marginBottom: 14 }}>Pick a market from the live prices, set your stake, sign with your wallet.<br />Your challenge appears here for anyone to take.</p>
                <Link href="/xray" className="go" style={{ display: "inline-block", textDecoration: "none", padding: "13px 26px", width: "auto" }}>
                  POST THE FIRST CHALLENGE →
                </Link>
              </div>
            )}
            {bets?.map((b) => (
              <div className="mkfix" key={b.d.slice(0, 24)}>
                <div className="mkhead"><div>{b.label}</div><span>{shortKey(b.creator)}</span></div>
                <div className="mkrow" style={{ justifyContent: "space-between" }}>
                  <span className="mklabel" style={{ width: "auto" }}>FAIR {Number(b.fairPrice).toFixed(2)} · BACKED £{b.stake}</span>
                  <Link href={`/bet?d=${b.d}`} className="mkpx" style={{ textDecoration: "none" }}>
                    {b.closed ? "CLOSED · IN PLAY" : b.remaining <= 0 ? "FULLY MATCHED" : `TAKE FROM £1 · £${b.remaining} OPEN →`}
                  </Link>
                </div>
                <div className="bar" style={{ height: 8, marginTop: 7 }}>
                  <div className="fair" style={{ width: `${b.totalLiability ? Math.min(100, (b.matched / b.totalLiability) * 100) : 0}%`, background: "var(--won)" }} />
                </div>
                <div className="sub" style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--mono)", fontSize: 10, color: "var(--dim)", marginTop: 5 }}>
                  <span>£{b.matched ?? 0} matched of £{b.totalLiability} liability</span>
                  <span>{b.fills?.length ?? 0} taker{(b.fills?.length ?? 0) === 1 ? "" : "s"}{b.ko && !b.closed ? ` · closes ${new Date(b.ko).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}` : ""}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="foot">Every bet settles on the official result.<br />No bookmaker. No arguing.</p>
        </div>

        <div className="boardcol">
          <p className="eyebrow">Live fair prices · post any of these</p>
          <div className="card">
            {!board && <p className="mknote">LOADING LIVE ODDS…</p>}
            {board?.map((f: any) => {
              const ko = new Date(f.startTime).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
              return (
                <div className="mkfix" key={f.fixtureId}>
                  <div className="mkhead"><div>{f.home} v {f.away}</div><span>KO {ko}</span></div>
                  <div className="mkrow">
                    <span className="mklabel">RESULT</span>
                    {f.oneX2.home && <Link href="/xray" className="mkpx" style={{ textDecoration: "none" }}><small>{flag(f.home)}</small>{f.oneX2.home.toFixed(2)}</Link>}
                    {f.oneX2.draw && <Link href="/xray" className="mkpx" style={{ textDecoration: "none" }}><small>X</small>{f.oneX2.draw.toFixed(2)}</Link>}
                    {f.oneX2.away && <Link href="/xray" className="mkpx" style={{ textDecoration: "none" }}><small>{flag(f.away)}</small>{f.oneX2.away.toFixed(2)}</Link>}
                  </div>
                  {f.goals.filter((g: any) => g.over || g.under).slice(0, 3).map((g: any) => (
                    <div className="mkrow" key={`g${g.line}`}>
                      <span className="mklabel">GOALS {g.line}</span>
                      {g.over && <Link href="/xray" className="mkpx" style={{ textDecoration: "none" }}><small>O</small>{g.over.toFixed(2)}</Link>}
                      {g.under && <Link href="/xray" className="mkpx" style={{ textDecoration: "none" }}><small>U</small>{g.under.toFixed(2)}</Link>}
                    </div>
                  ))}
                  {f.handicap.filter((h: any) => h.home || h.away).slice(0, 3).map((h: any) => (
                    <div className="mkrow" key={`h${h.line}`}>
                      <span className="mklabel">AH {h.line}</span>
                      {h.home && <Link href="/xray" className="mkpx" style={{ textDecoration: "none" }}><small>{flag(f.home)}</small>{h.home.toFixed(2)}</Link>}
                      {h.away && <Link href="/xray" className="mkpx" style={{ textDecoration: "none" }}><small>{flag(f.away)}</small>{h.away.toFixed(2)}</Link>}
                    </div>
                  ))}
                </div>
              );
            })}
            <p className="mknote">Fair odds by TxODDS · tap any price to build a challenge<br />Match result · total goals · handicaps</p>
          </div>
        </div>
      </div>
    </div>
  );
}
