import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncProductSales } from "@/lib/nhanh/sync-product-sales";
import { nhanhV3 } from "@/lib/nhanh/client";

export const maxDuration = 300;

// GET: test V3 order/list API — xem Nhanh trả gì
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || "2026-04-17";
  const fromTs = Math.floor(new Date(date + "T00:00:00+07:00").getTime() / 1000);
  const toTs = Math.floor(new Date(date + "T23:59:59+07:00").getTime() / 1000);

  const raw = await nhanhV3<unknown>("order/list", {
    filters: { createdAtFrom: fromTs, createdAtTo: toTs },
    paginator: { size: 5 },
  });

  // Đếm data
  let dataCount = 0;
  let dataType = "none";
  if (raw.data) {
    dataType = Array.isArray(raw.data) ? "array" : typeof raw.data;
    if (Array.isArray(raw.data)) dataCount = raw.data.length;
    else if (typeof raw.data === "object") dataCount = Object.keys(raw.data as Record<string, unknown>).length;
  }

  return NextResponse.json({
    test: true,
    date,
    fromTs,
    toTs,
    code: raw.code,
    messages: raw.messages,
    dataType,
    dataCount,
    paginator: raw.paginator,
    sample: Array.isArray(raw.data) ? raw.data[0] : raw.data ? Object.values(raw.data as Record<string, unknown>)[0] : null,
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // clear=true → xoá toàn bộ data cũ trước khi sync lại
    if (body.clear) {
      const db = supabaseAdmin();
      const { error, count } = await db.from("product_sales").delete({ count: "exact" }).gte("date", "2000-01-01");
      if (error) {
        return NextResponse.json({ ok: false, error: "Xoá data lỗi: " + error.message }, { status: 500 });
      }
      console.log(`[sync] Cleared ${count} old rows`);
    }

    const from = body.from;
    const to = body.to;
    if (from && to) {
      const diffDays = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
      if (diffDays > 35) {
        return NextResponse.json({ ok: false, error: `Khoảng ${diffDays} ngày quá dài — giới hạn 35 ngày/lần.` }, { status: 400 });
      }
    }

    const result = await syncProductSales({ from, to });
    return NextResponse.json({ ok: true, fetched: result.totalRows, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("sync-product-sales error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
