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
  const PG = 1000;

  // Fetch products + sales in parallel
  const productsPromise = (async () => {
    const all: Array<{ sku: string; product_name: string; stock: number; cost_price: number }> = [];
    let off = 0;
    while (true) {
      const { data } = await db.from("products")
        .select("sku, product_name, stock, cost_price")
        .range(off, off + PG - 1);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PG) break;
      off += PG;
    }
    return all;
  })();

  const salesPromise = (async () => {
    const map = new Map<string, number>();
    if (!from || !to) return map;
    let off = 0;
    while (true) {
      const { data } = await db.from("product_sales")
        .select("sku, qty")
        .gte("date", from).lte("date", to)
        .range(off, off + PG - 1);
      if (!data || data.length === 0) break;
      for (const r of data) map.set(r.sku, (map.get(r.sku) || 0) + Number(r.qty || 0));
      if (data.length < PG) break;
      off += PG;
    }
    return map;
  })();

  const [allProducts, salesMap] = await Promise.all([productsPromise, salesPromise]);

  // Categorize
  const counts = { no_sale: 0, slow: 0, normal: 0, good: 0, no_data: 0 };
  const hasSalesData = salesMap.size > 0;
  const items = allProducts.map((p) => {
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
    return { sku: p.sku, product_name: p.product_name, stock, sold, rate, category, stockValue, cost_price: Number(p.cost_price || 0) };
  });

  const res = NextResponse.json({ ok: true, total: allProducts.length, counts, items });
  res.headers.set("Cache-Control", "private, max-age=3600, stale-while-revalidate=7200");
  return res;
}
