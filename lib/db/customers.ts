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
  limit?: number;
  offset?: number;
} = {}): Promise<{ rows: CustomerRow[]; total: number }> {
  const { search, limit = 100, offset = 0 } = opts;
  const db = supabaseAdmin();
  let q = db
    .from("customers")
    .select(
      "customer_id, name, phone, email, city, total_orders, total_revenue, last_order_date, channels",
      { count: "exact" },
    )
    .order("total_revenue", { ascending: false, nullsFirst: false });

  if (search) {
    const s = search.trim();
    q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,customer_id.eq.${s}`);
  }
  const { data, count } = await q.range(offset, offset + limit - 1);
  return { rows: (data as CustomerRow[]) || [], total: count || 0 };
}
