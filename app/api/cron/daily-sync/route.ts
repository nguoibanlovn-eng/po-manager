import { NextResponse } from "next/server";
import { syncProducts, syncInventory, syncSalesByChannel } from "@/lib/nhanh/sync";
import { syncFbAds, syncFbPageInsights } from "@/lib/fb/sync";

export const maxDuration = 800;

// Triggered by Supabase pg_cron (see supabase/migrations/0005_cron.sql).
// Auth: Authorization: Bearer <CRON_SECRET> header.
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};
  const t0 = Date.now();

  // Run each sync, collect results, keep going on error
  for (const [name, fn] of [
    ["products", () => syncProducts()],
    ["inventory", () => syncInventory()],
    ["sales", () => syncSalesByChannel({})],
    ["fb_ads", () => syncFbAds({})],
    ["fb_insights", () => syncFbPageInsights()],
  ] as const) {
    try {
      const r = await fn();
      results[name] = { ok: true, ...r };
    } catch (e) {
      results[name] = { ok: false, error: (e as Error).message };
    }
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
