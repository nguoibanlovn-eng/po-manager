import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/tiktok/shop-api";

// TikTok Shop redirects here after shop owner authorizes
// URL: /api/tiktok-shop/callback?code=xxx OR ?auth_code=xxx
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || url.searchParams.get("auth_code");

  // Debug: log all params to help troubleshoot
  const allParams = Object.fromEntries(url.searchParams.entries());
  console.log("[TikTok Shop Callback] params:", JSON.stringify(allParams));

  if (!code) {
    // Show params so user can see what TikTok sent
    return new Response(
      JSON.stringify({ error: "missing_code", received_params: allParams }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const result = await exchangeCode(code);

  if (result.ok) {
    const names = (result.shops || []).map((s) => s.name).join(",");
    return NextResponse.redirect(new URL(`/sales-leader?tiktok_shop_connected=${encodeURIComponent(names)}`, req.url));
  } else {
    // Show error detail instead of redirect (for debugging)
    return new Response(
      JSON.stringify({ error: result.error, code_used: code.substring(0, 20) + "..." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
}
