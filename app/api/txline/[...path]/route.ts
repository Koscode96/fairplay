import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await ctx.params;
  const origin = process.env.TXLINE_API_ORIGIN;
  const jwt = process.env.TXLINE_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;
  const configured = Boolean(origin && jwt && apiToken);

  const path = parts.join("/");
  if (path === "__status") {
    return NextResponse.json({
      configured,
      network: origin?.includes("-dev") ? "devnet" : origin ? "mainnet" : undefined,
    });
  }
  if (!configured) {
    return NextResponse.json({ error: "TxLINE not configured" }, { status: 503 });
  }

  const url = `${origin}/api/${path}${req.nextUrl.search}`;
  const upstream = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken! },
    cache: "no-store",
  });
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
