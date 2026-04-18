import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/user";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

  const db = supabaseAdmin();
  let query = db.from("inventory").select("sku, product_name, available_qty, category").gt("available_qty", 0);
  if (q.trim()) {
    query = query.or(`product_name.ilike.%${q}%,sku.ilike.%${q}%`);
  }
  const { data } = await query.order("available_qty", { ascending: false }).limit(limit);

  // Enrich with cost_price from products table
  const items = data || [];
  if (items.length > 0) {
    const skus = items.map((r) => r.sku);
    const { data: prods } = await db.from("products").select("sku, cost_price, sell_price").in("sku", skus);
    const priceMap = new Map((prods || []).map((p) => [p.sku, p]));
    for (const item of items) {
      const p = priceMap.get(item.sku);
      (item as Record<string, unknown>).cost_price = p?.cost_price || 0;
      (item as Record<string, unknown>).sell_price = p?.sell_price || 0;
    }
  }

  return NextResponse.json({ ok: true, items });
}
