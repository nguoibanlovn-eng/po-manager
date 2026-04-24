import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/user";
import { dateVN } from "@/lib/helpers";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || dateVN(null, -30);
  const to = searchParams.get("to") || dateVN();
  const channel = searchParams.get("channel") || "";
  const q = searchParams.get("q") || "";
  const sort = searchParams.get("sort") || "revenue_desc";

  const db = supabaseAdmin();
  const PG = 1000;

  // Fetch all sales with order_id for unique order counting
  const all: Array<{ sku: string; product_name: string; channel_name: string; order_id: string; qty: number; revenue: number }> = [];
  let off = 0;
  while (true) {
    let query = db.from("product_sales")
      .select("sku, product_name, channel_name, order_id, qty, revenue")
      .gte("date", from).lte("date", to);
    if (channel) query = query.eq("channel_name", channel);
    if (q) query = query.or(`sku.ilike.%${q}%,product_name.ilike.%${q}%`);
    const { data } = await query.range(off, off + PG - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PG) break;
    off += PG;
  }

  // Aggregate by SKU — use actual revenue, count unique orders
  const bySku = new Map<string, { sku: string; product_name: string; channels: Set<string>; orderIds: Set<string>; qty: number; revenue: number }>();
  const channels = new Set<string>();
  const allOrderIds = new Set<string>();

  for (const r of all) {
    channels.add(r.channel_name || "");
    allOrderIds.add(r.order_id);
    const cur = bySku.get(r.sku) || { sku: r.sku, product_name: r.product_name, channels: new Set(), orderIds: new Set(), qty: 0, revenue: 0 };
    cur.qty += Number(r.qty || 0);
    cur.revenue += Number(r.revenue || 0);
    cur.orderIds.add(r.order_id);
    cur.channels.add(r.channel_name || "");
    bySku.set(r.sku, cur);
  }

  let items = Array.from(bySku.values()).map((v) => ({
    sku: v.sku,
    product_name: v.product_name,
    channels: Array.from(v.channels).join(", "),
    qty: v.qty,
    orders: v.orderIds.size,
    revenue: v.revenue,
  }));

  // Sort
  if (sort === "revenue_desc") items.sort((a, b) => b.revenue - a.revenue);
  else if (sort === "revenue_asc") items.sort((a, b) => a.revenue - b.revenue);
  else if (sort === "qty_desc") items.sort((a, b) => b.qty - a.qty);
  else if (sort === "qty_asc") items.sort((a, b) => a.qty - b.qty);

  const totalSkus = items.length;
  const totalOrders = allOrderIds.size;
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);

  const res = NextResponse.json({
    ok: true,
    items,
    summary: { totalSkus, totalOrders, totalQty, totalRevenue },
    channels: Array.from(channels).filter(Boolean).sort(),
    from, to,
  });
  // Cache 1 hour — data only changes via daily cron sync
  res.headers.set("Cache-Control", "private, max-age=3600, stale-while-revalidate=7200");
  return res;
}
