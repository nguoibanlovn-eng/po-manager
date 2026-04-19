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

  // Fetch sales + products in parallel
  const PG = 1000;

  // 1. Fetch all sales (large batches)
  const salesPromise = (async () => {
    const all: Array<{ sku: string; product_name: string; channel_name: string; qty: number; revenue: number }> = [];
    let off = 0;
    while (true) {
      let query = db.from("product_sales")
        .select("sku, product_name, channel_name, qty, revenue")
        .gte("date", from).lte("date", to);
      if (channel) query = query.eq("channel_name", channel);
      if (q) query = query.or(`sku.ilike.%${q}%,product_name.ilike.%${q}%`);
      const { data } = await query.range(off, off + PG - 1);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PG) break;
      off += PG;
    }
    return all;
  })();

  // 2. Pre-fetch all products sell_price (parallel)
  const pricePromise = (async () => {
    const map = new Map<string, number>();
    let off = 0;
    while (true) {
      const { data } = await db.from("products").select("sku, sell_price").range(off, off + PG - 1);
      if (!data || data.length === 0) break;
      for (const p of data) if (p.sell_price) map.set(p.sku, Number(p.sell_price));
      if (data.length < PG) break;
      off += PG;
    }
    return map;
  })();

  const [allData, priceMap] = await Promise.all([salesPromise, pricePromise]);

  // Aggregate by SKU
  const bySku = new Map<string, { sku: string; product_name: string; channels: Set<string>; qty: number; orders: number; revenue: number }>();
  const channels = new Set<string>();
  for (const r of allData) {
    channels.add(r.channel_name || "");
    const cur = bySku.get(r.sku) || { sku: r.sku, product_name: r.product_name, channels: new Set(), qty: 0, orders: 0, revenue: 0 };
    cur.qty += Number(r.qty || 0);
    cur.orders++;
    cur.revenue += Number(r.revenue || 0);
    cur.channels.add(r.channel_name || "");
    bySku.set(r.sku, cur);
  }

  let items = Array.from(bySku.values()).map((v) => {
    const sellPrice = priceMap.get(v.sku) || 0;
    const estRevenue = sellPrice > 0 ? v.qty * sellPrice : v.revenue;
    return {
      sku: v.sku, product_name: v.product_name, channels: Array.from(v.channels).join(", "),
      qty: v.qty, orders: v.orders, revenue: estRevenue,
    };
  });

  // Sort
  if (sort === "revenue_desc") items.sort((a, b) => b.revenue - a.revenue);
  else if (sort === "revenue_asc") items.sort((a, b) => a.revenue - b.revenue);
  else if (sort === "qty_desc") items.sort((a, b) => b.qty - a.qty);
  else if (sort === "qty_asc") items.sort((a, b) => a.qty - b.qty);

  // Summary (tính trên toàn bộ, không paginate)
  const totalSkus = items.length;
  const totalOrders = items.reduce((s, i) => s + i.orders, 0);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);

  return NextResponse.json({
    ok: true,
    items, // gửi hết, frontend paginate
    summary: { totalSkus, totalOrders, totalQty, totalRevenue },
    channels: Array.from(channels).filter(Boolean).sort(),
    from, to,
  });
}
