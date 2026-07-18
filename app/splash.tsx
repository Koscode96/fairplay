"use client";
import { useEffect, useState } from "react";

export default function Splash({ word = "FAIRPLAY", accentFrom = 4, tag = "P2P FAIR ODDS · TxODDS · SOLANA" }: { word?: string; accentFrom?: number; tag?: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setOn(false); return; }
    const t = setTimeout(() => setOn(false), 2900);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;
  return (
    <div className="splash" onClick={() => setOn(false)}>
      <div className="wordmark">
        {word.split("").map((c, i) => (
          <span key={i} className="l" style={{ animationDelay: `${i * 0.05}s`, color: i >= accentFrom ? "var(--margin)" : undefined }}>{c}</span>
        ))}
        <span className="sweep" />
        <span className="tag">{tag}</span>
      </div>
    </div>
  );
}
