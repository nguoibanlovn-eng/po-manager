import { NextResponse } from "next/server";
import { syncSscInventory } from "@/lib/ssc/sync";

export const maxDuration = 300;

// Triggered by pg_cron — runs SSC inventory sync 3x/day.
// Also re-syncs Nhanh products first to get fresh stock_kho_tru.
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    // Sync Nhanh products first (to get fresh stock_kho_tru)
    const { syncProducts } = await import("@/lib/nhanh/sync");
    const nhanh = await syncProducts();

    // Then sync SSC
    const ssc = await syncSscInventory();

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - t0,
      nhanh: { inserted: nhanh.inserted },
      ssc: { total: ssc.total, found: ssc.found, updated: ssc.updated },
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      duration_ms: Date.now() - t0,
    }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
