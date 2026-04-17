import { NextResponse } from "next/server";
import { syncProductsAndInventory, syncSalesByChannel } from "@/lib/nhanh/sync";
import { syncFbAds, syncFbPageInsights } from "@/lib/fb/sync";
import { refreshAllShopTokens } from "@/lib/tiktok/shop-api";

export const maxDuration = 300;

// Triggered by Supabase pg_cron (see supabase/migrations/0005_cron.sql).
// Auth: Authorization: Bearer <CRON_SECRET> header.
//
// Runs all syncs in PARALLEL to fit within Vercel Pro's 300s limit.
// Note: Nhanh products + inventory both hit the same v3 product/list
// endpoint — running in parallel doubles API calls but saves wall time.
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();

  const jobs = [
    // Gộp products + inventory vì cùng gọi 1 endpoint Nhanh v3.
    { name: "products_inventory", fn: () => syncProductsAndInventory() },
    { name: "sales",              fn: () => syncSalesByChannel({}) },
    { name: "fb_ads",             fn: () => syncFbAds({}) },
    { name: "fb_insights",        fn: () => syncFbPageInsights() },
    { name: "tiktok_shop_refresh", fn: () => refreshAllShopTokens() },
  ] as const;

  const settled = await Promise.allSettled(jobs.map((j) => j.fn()));
  const results: Record<string, unknown> = {};
  for (let i = 0; i < jobs.length; i++) {
    const s = settled[i];
    results[jobs[i].name] = s.status === "fulfilled"
      ? { ok: true, ...s.value }
      : { ok: false, error: s.reason instanceof Error ? s.reason.message : String(s.reason) };
  }

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - t0,
    results,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
