import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/user";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const db = supabaseAdmin();

  // 1. Load ALL products (sku, stock, cost_price)
  const allProducts: Array<{ sku: string; product_name: string; stock: number; cost_price: number; sell_price: number }> = [];
  let off = 0;
  const PG = 1000;
  while (true) {
    const { data } = await db.from("products")
      .select("sku, product_name, stock, cost_price, sell_price")
      .range(off, off + PG - 1);
    if (!data || data.length === 0) break;
    allProducts.push(...data);
    if (data.length < PG) break;
    off += PG;
  }

  // 2. Load sales data aggregated by SKU (if date range provided)
  const salesMap = new Map<string, number>();
  if (from && to) {
    let sOff = 0;
    while (true) {
      const { data } = await db.from("product_sales")
        .select("sku, qty")
        .gte("date", from).lte("date", to)
        .range(sOff, sOff + PG - 1);
      if (!data || data.length === 0) break;
      for (const r of data) {
        salesMap.set(r.sku, (salesMap.get(r.sku) || 0) + Number(r.qty || 0));
      }
      if (data.length < PG) break;
      sOff += PG;
    }
  }

  // 3. Categorize each product
  const counts = { no_sale: 0, slow: 0, normal: 0, good: 0, no_data: 0 };
  const items: Array<{
    sku: string; product_name: string; stock: number; sold: number;
    rate: number; category: string; stockValue: number; cost_price: number;
  }> = [];

  const hasSalesData = salesMap.size > 0;

  for (const p of allProducts) {
    const stock = Math.max(0, Number(p.stock || 0));
    const sold = salesMap.get(p.sku) || 0;
    const rate = stock > 0 ? (sold / stock) * 100 : sold > 0 ? 999 : 0;
    const stockValue = stock * Number(p.cost_price || 0);

    let category: string;
    if (!hasSalesData && sold === 0 && stock > 0) category = "no_data";
    else if (stock <= 0 && sold === 0) category = "no_data";
    else if (sold === 0) category = "no_sale";
    else if (rate < 10) category = "slow";
    else if (rate <= 30) category = "normal";
    else category = "good";

    counts[category as keyof typeof counts]++;
    items.push({ sku: p.sku, product_name: p.product_name, stock, sold, rate, category, stockValue, cost_price: Number(p.cost_price || 0) });
  }

  return NextResponse.json({
    ok: true,
    total: allProducts.length,
    counts,
    items, // full list — frontend filters/sorts/paginates
  });
}
