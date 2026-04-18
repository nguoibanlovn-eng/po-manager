import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncProductSales } from "@/lib/nhanh/sync-product-sales";
import { nhanhReq } from "@/lib/nhanh/client";
export const maxDuration = 300;

// GET: debug raw V1 /order/index response
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || "2026-04-17";

  const raw = await nhanhReq<unknown>("/order/index", {
    filters: { createdFrom: date, createdTo: date },
    paginator: { page: 1, size: 3 },
  });

  // Inspect response structure
  const data = raw.data as Record<string, unknown> | null;
  let orderCount = 0;
  let orderKeys: string[] = [];
  const topLevelKeys = data ? Object.keys(data) : [];

  if (data?.orders && typeof data.orders === "object") {
    const orders = data.orders as Record<string, unknown>;
    orderCount = Object.keys(orders).length;
    orderKeys = Object.keys(orders).slice(0, 3);
  }

  // Extract products from first order to debug SKU fields
  let productFields: string[] = [];
  let productSample: unknown = null;
  if (data?.orders && typeof data.orders === "object") {
    const firstOrder = Object.values(data.orders as Record<string, Record<string, unknown>>)[0];
    const prods = firstOrder?.products;
    if (Array.isArray(prods) && prods.length > 0) {
      productFields = Object.keys(prods[0]);
      productSample = prods[0];
    } else if (prods && typeof prods === "object") {
      const first = Object.values(prods as Record<string, unknown>)[0] as Record<string, unknown>;
      productFields = Object.keys(first || {});
      productSample = first;
    }
  }

  return NextResponse.json({
    code: raw.code,
    paginator_response: raw.paginator,
    data_topLevelKeys: topLevelKeys,
    data_totalPages: data?.totalPages,
    data_totalRecords: data?.totalRecords,
    data_orderCount: orderCount,
    productFields,
    productSample,
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
      if (diffDays > 10) {
        return NextResponse.json({ ok: false, error: `Khoảng ${diffDays} ngày quá dài — giới hạn 10 ngày/lần.` }, { status: 400 });
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
