"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { shortKey } from "../lib/phantom";
import Splash from "./splash";

export default function Home() {
  const [bets, setBets] = useState<any[] | null>(null);
  useEffect(() => {
    fetch("/api/bets").then((r) => r.json()).then((d) => setBets(d.bets ?? [])).catch(() => setBets([]));
  }, []);
  return (
    <div className="wrap">
      <Splash />
      <div className="brand">
        <h1><Link href="/" style={{ color: "inherit", textDecoration: "none" }}>FAIR<b>PLAY</b></Link></h1>
        <div className="net"><Link href="/xray" style={{ color: "var(--dim)", textDecoration: "none" }}>POST A CHALLENGE</Link> · OPEN BETS</div>
      </div>
      <p className="eyebrow">Open bets · fair odds · take either side</p>
      <div className="card">
        {bets === null && <p className="mknote">LOADING…</p>}
        {bets?.length === 0 && (
          <p className="mknote">No open bets right now.<br /><Link href="/xray" style={{ color: "var(--margin)" }}>Post the first challenge</Link>.</p>
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
  );
}
