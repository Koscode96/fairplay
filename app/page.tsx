"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { shortKey } from "../lib/phantom";

export default function Home() {
  const [bets, setBets] = useState<any[] | null>(null);
  useEffect(() => {
    fetch("/api/bets").then((r) => r.json()).then((d) => setBets(d.bets ?? [])).catch(() => setBets([]));
  }, []);
  return (
    <div className="wrap">
      <div className="brand">
        <h1><Link href="/" style={{ color: "inherit", textDecoration: "none" }}>FAIR<b>LINE</b></Link></h1>
        <div className="net"><Link href="/xray" style={{ color: "var(--dim)", textDecoration: "none" }}>POST A CHALLENGE</Link> · OPEN BETS</div>
      </div>
      <p className="eyebrow">Open bets · TxODDS fair prices · take either side</p>
      <div className="card">
        {bets === null && <p className="mknote">LOADING…</p>}
        {bets?.length === 0 && (
          <p className="mknote">No open bets right now.<br /><Link href="/xray" style={{ color: "var(--margin)" }}>Post the first challenge</Link>.</p>
        )}
        {bets?.map((b) => (
          <div className="mkfix" key={b.d.slice(0, 24)}>
            <div className="mkhead"><div>{b.label}</div><span>{shortKey(b.creator)}</span></div>
            <div className="mkrow" style={{ justifyContent: "space-between" }}>
              <span className="mklabel" style={{ width: "auto" }}>FAIR {Number(b.fairPrice).toFixed(2)} · £{b.stake}</span>
              <Link href={`/bet?d=${b.d}`} className="mkpx" style={{ textDecoration: "none" }}>TAKE THE OTHER SIDE →</Link>
            </div>
          </div>
        ))}
      </div>
      <p className="foot">Both sides sign with their own wallet.<br />TxODDS verified data settles it.</p>
    </div>
  );
}
