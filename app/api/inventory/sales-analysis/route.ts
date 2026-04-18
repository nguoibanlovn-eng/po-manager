import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/user";
import { dateVN } from "@/lib/helpers";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const from = dateVN(null, -30);
  const to = dateVN();

  // Paginated fetch from sales_sync
  const allData: Array<{ channel: string; source: string; revenue_net: number; order_net: number }> = [];
  let offset = 0;
  const PG = 1000;
  while (true) {
    const { data: page } = await db
      .from("sales_sync")
      .select("channel, source, revenue_net, order_net")
      .gte("period_from", from).lte("period_from", to)
      .range(offset, offset + PG - 1);
    if (!page || page.length === 0) break;
    allData.push(...page);
    if (page.length < PG) break;
    offset += PG;
  }

  // Group by channel + source
  const items = new Map<string, { channel: string; product_name: string; revenue: number; orders: number }>();
  for (const r of allData) {
    const key = `${r.channel}|${r.source}`;
    const cur = items.get(key) || { channel: r.channel, product_name: r.source, revenue: 0, orders: 0 };
    cur.revenue += Number(r.revenue_net || 0);
    cur.orders += Number(r.order_net || 0);
    items.set(key, cur);
  }

  return NextResponse.json({
    ok: true,
    items: Array.from(items.values())
      .map((v) => ({ sku: "", ...v }))
      .sort((a, b) => b.revenue - a.revenue),
  });
}
