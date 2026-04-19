import { NextResponse } from "next/server";
import { refreshAllShopTokens } from "@/lib/tiktok/shop-api";
import { refreshAllShopeeTokens } from "@/lib/shopee/api";

export const maxDuration = 60;

// Chạy mỗi 2 giờ — giữ Shopee + TikTok token sống
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  const results: Record<string, unknown> = {};

  try {
    const shopee = await refreshAllShopeeTokens();
    results.shopee = { ok: true, ...shopee };
  } catch (e) {
    results.shopee = { ok: false, error: (e as Error).message };
  }

  try {
    const tiktok = await refreshAllShopTokens();
    results.tiktok = { ok: true, ...tiktok };
  } catch (e) {
    results.tiktok = { ok: false, error: (e as Error).message };
  }

  return NextResponse.json({ ok: true, duration_ms: Date.now() - t0, results });
}

export async function GET(req: Request) {
  return POST(req);
}
