import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();

  const db = supabaseAdmin();
  let query = db
    .from("products")
    .select("id, sku, product_name, cost_price, sell_price, stock, image_url, category")
    .eq("is_active", true)
    .order("product_name", { ascending: true })
    .limit(50);
  if (q) query = query.or(`sku.ilike.%${q}%,product_name.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, products: data || [] });
}
