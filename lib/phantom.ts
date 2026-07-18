/** Minimal Phantom integration — no adapter packages needed. */

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: { toBase58(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array, encoding: "utf8"): Promise<{ signature: Uint8Array }>;
}

export function getPhantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { phantom?: { solana?: PhantomProvider }; solana?: PhantomProvider };
  const p = w.phantom?.solana ?? w.solana;
  return p?.isPhantom ? p : null;
}

export async function connectPhantom(): Promise<string | null> {
  const p = getPhantom();
  if (!p) {
    window.open("https://phantom.app/", "_blank");
    return null;
  }
  const { publicKey } = await p.connect();
  return publicKey.toBase58();
}

/** Sign a bet commitment: returns base64 signature over the bet payload. */
export async function signBetCommitment(payload: object): Promise<string | null> {
  const p = getPhantom();
  if (!p?.publicKey) return null;
  const msg = new TextEncoder().encode(JSON.stringify(payload));
  const { signature } = await p.signMessage(msg, "utf8");
  return btoa(String.fromCharCode(...signature));
}

export const shortKey = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

/** Anchor a bet commitment on Solana devnet via the Memo program. Returns tx signature. */
export async function anchorOnDevnet(payload: object): Promise<{ sig: string } | { error: string }> {
  const p = getPhantom() as any;
  if (!p?.publicKey) return { error: "Connect Phantom first" };
  try {
    const { Connection, PublicKey, Transaction, TransactionInstruction } = await import("@solana/web3.js");
    const conn = new Connection("https://api.devnet.solana.com", "confirmed");
    const data = new TextEncoder().encode(`fairline:v1:${JSON.stringify(payload)}`);
    const ix = new TransactionInstruction({
      keys: [],
      programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      data: Buffer.from(data),
    });
    const tx = new Transaction().add(ix);
    tx.feePayer = new PublicKey(p.publicKey.toBase58());
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    const { signature } = await p.signAndSendTransaction(tx);
    return { sig: signature };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.toLowerCase().includes("insufficient") || msg.includes("0x1")) {
      return { error: "Devnet wallet needs SOL — airdrop at faucet.solana.com (set Phantom to Devnet)" };
    }
    return { error: msg.slice(0, 120) };
  }
}
