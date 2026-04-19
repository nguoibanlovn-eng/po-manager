import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type CustomerRow = {
  customer_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  total_orders: number | null;
  total_revenue: number | null;
  last_order_date: string | null;
  channels: string | null;
};

export async function listCustomers(opts: {
  search?: string;
  sort?: string;
  city?: string;
  minOrders?: number;
  limit?: number;
  offset?: number;
} = {}): Promise<{ rows: CustomerRow[]; total: number }> {
  const { search, sort = "revenue_desc", city, minOrders, limit = 100, offset = 0 } = opts;
  const db = supabaseAdmin();
  let q = db
    .from("customers")
    .select(
      "customer_id, name, phone, email, city, total_orders, total_revenue, last_order_date, channels",
      { count: "exact" },
    );

  if (search) {
    const s = search.trim();
    q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,customer_id.eq.${s}`);
  }
  if (city) q = q.eq("city", city);
  if (minOrders && minOrders > 1) q = q.gte("total_orders", minOrders);

  if (sort === "orders_desc") q = q.order("total_orders", { ascending: false, nullsFirst: false });
  else if (sort === "recent") q = q.order("last_order_date", { ascending: false, nullsFirst: false });
  else if (sort === "name_asc") q = q.order("name", { ascending: true });
  else q = q.order("total_revenue", { ascending: false, nullsFirst: false });

  const { data, count } = await q.range(offset, offset + limit - 1);
  return { rows: (data as CustomerRow[]) || [], total: count || 0 };
}

export type CustomerStats = {
  totalCustomers: number;
  totalRevenue: number;
  avgRevenue: number;
  repeatBuyers: number;
  repeatPct: number;
  cities: string[];
};

export async function getCustomerStats(): Promise<CustomerStats> {
  const db = supabaseAdmin();

  // Counts (head-only, no row limit)
  const [totalRes, repeatRes] = await Promise.all([
    db.from("customers").select("*", { count: "exact", head: true }),
    db.from("customers").select("*", { count: "exact", head: true }).gte("total_orders", 2),
  ]);

  // Sum revenue + collect cities — phải loop hết vì Supabase max 1000/request
  let totalRevenue = 0;
  const citySet = new Set<string>();
  let off = 0;
  const PG = 1000;
  while (true) {
    const { data } = await db.from("customers")
      .select("total_revenue, city")
      .range(off, off + PG - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      totalRevenue += Number(r.total_revenue || 0);
      if (r.city) citySet.add(r.city as string);
    }
    if (data.length < PG) break;
    off += PG;
  }

  const totalCustomers = totalRes.count || 0;
  const repeatBuyers = repeatRes.count || 0;

  return {
    totalCustomers,
    totalRevenue,
    avgRevenue: totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers) : 0,
    repeatBuyers,
    repeatPct: totalCustomers > 0 ? Math.round((repeatBuyers / totalCustomers) * 100) : 0,
    cities: Array.from(citySet).sort(),
  };
}
