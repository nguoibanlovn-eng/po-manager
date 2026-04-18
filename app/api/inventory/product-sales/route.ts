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
  const limit = Math.min(Number(searchParams.get("limit")) || 200, 500);
  const offset = Number(searchParams.get("offset")) || 0;

  const db = supabaseAdmin();

  // Aggregate product_sales by SKU
  // Since Supabase REST doesn't support GROUP BY, fetch raw + aggregate in JS
  const allData: Array<{ sku: string; product_name: string; channel_name: string; qty: number; revenue: number; date: string }> = [];
  let off = 0;
  const PG = 1000;
  while (true) {
    let query = db.from("product_sales")
      .select("sku, product_name, channel_name, qty, revenue, date")
      .gte("date", from).lte("date", to);
    if (channel) query = query.eq("channel_name", channel);
    if (q) query = query.or(`sku.ilike.%${q}%,product_name.ilike.%${q}%`);
    const { data: page } = await query.range(off, off + PG - 1);
    if (!page || page.length === 0) break;
    allData.push(...page);
    if (page.length < PG) break;
    off += PG;
  }

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

  // Join với products table để lấy sell_price → tính doanh thu ước tính (giống GAS)
  const allSkus = Array.from(bySku.keys());
  const priceMap = new Map<string, number>();
  for (let i = 0; i < allSkus.length; i += 500) {
    const chunk = allSkus.slice(i, i + 500);
    const { data: prods } = await db.from("products").select("sku, sell_price").in("sku", chunk);
    if (prods) for (const p of prods) if (p.sell_price) priceMap.set(p.sku, Number(p.sell_price));
  }

  let items = Array.from(bySku.values()).map((v) => {
    const sellPrice = priceMap.get(v.sku) || 0;
    // Doanh thu ước tính = qty × sell_price catalog (giống GAS)
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

  // Summary
  const totalSkus = items.length;
  const totalOrders = items.reduce((s, i) => s + i.orders, 0);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);

  // Paginate
  const paginated = items.slice(offset, offset + limit);

  return NextResponse.json({
    ok: true,
    items: paginated,
    total: totalSkus,
    summary: { totalSkus, totalOrders, totalQty, totalRevenue },
    channels: Array.from(channels).filter(Boolean).sort(),
    from, to,
  });
}
