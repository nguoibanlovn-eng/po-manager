import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/shopee/api";

// Shopee redirects here after shop owner authorizes
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const shopId = url.searchParams.get("shop_id");

  if (!code || !shopId) {
    return NextResponse.redirect(new URL("/shopee-ads?error=missing_params", req.url));
  }

  const result = await exchangeCode(code, Number(shopId));

  if (result.ok) {
    return NextResponse.redirect(new URL(`/shopee-ads?connected=${result.shop_name}`, req.url));
  } else {
    return NextResponse.redirect(new URL(`/shopee-ads?error=${encodeURIComponent(result.error || "unknown")}`, req.url));
  }
}
