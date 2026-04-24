import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/user";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const db = supabaseAdmin();

  // Lấy synced_at gần nhất từ product_sales
  const { data } = await db.from("product_sales")
    .select("synced_at, date")
    .order("synced_at", { ascending: false })
    .limit(1);

  const lastSync = data?.[0]?.synced_at || null;
  const lastDate = data?.[0]?.date || null;

  // Kiểm tra hôm nay đã có data chưa
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });

  const { count: todayCount } = await db.from("product_sales")
    .select("*", { count: "exact", head: true })
    .eq("date", today);

  const { count: yesterdayCount } = await db.from("product_sales")
    .select("*", { count: "exact", head: true })
    .eq("date", yesterday);

  const res = NextResponse.json({
    ok: true,
    lastSync,
    lastDate,
    today,
    todayRows: todayCount || 0,
    yesterdayRows: yesterdayCount || 0,
    synced: (todayCount || 0) > 0 || (yesterdayCount || 0) > 0,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
