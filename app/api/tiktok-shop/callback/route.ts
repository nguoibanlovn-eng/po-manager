import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/tiktok/shop-api";

// TikTok Shop redirects here after shop owner authorizes
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/tiktok-shop?error=missing_code", req.url));
  }

  const result = await exchangeCode(code);

  if (result.ok) {
    const names = (result.shops || []).map((s) => s.name).join(",");
    return NextResponse.redirect(new URL(`/tiktok-shop?connected=${encodeURIComponent(names)}`, req.url));
  } else {
    return NextResponse.redirect(new URL(`/tiktok-shop?error=${encodeURIComponent(result.error || "unknown")}`, req.url));
  }
}
