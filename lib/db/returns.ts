import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN, uid } from "@/lib/helpers";
import { toNum } from "@/lib/format";

export type ReturnRow = {
  token: string;
  date: string | null;
  product_name: string | null;
  sku: string | null;
  category: string | null;
  condition: string | null;
  description: string | null;
  basket: string | null;
  cost: number | null;
  repair_cost: number | null;
  sell_price: number | null;
  status: string | null;
  customer_name: string | null;
  phone: string | null;
  tracking: string | null;
  channel_sold: string | null;
  loss: number | null;
  created_by: string | null;
  created_at: string | null;
  sold_at: string | null;
  note: string | null;
  images: string | null;
};

export async function listReturns(status?: string): Promise<ReturnRow[]> {
  const db = supabaseAdmin();
  let q = db.from("return_log").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data } = await q.limit(500);
  return (data as ReturnRow[]) || [];
}

export async function createReturn(data: Partial<ReturnRow>, createdBy: string): Promise<string> {
  const token = uid("RET");
  const loss = Math.max(0, toNum(data.cost) + toNum(data.repair_cost) - toNum(data.sell_price));
  const { error } = await supabaseAdmin().from("return_log").insert({
    token,
    date: data.date || null,
    product_name: data.product_name || null,
    sku: data.sku || null,
    category: data.category || null,
    condition: data.condition || null,
    description: data.description || null,
    basket: data.basket || null,
    cost: toNum(data.cost),
    repair_cost: toNum(data.repair_cost),
    sell_price: toNum(data.sell_price),
    status: data.status || "PENDING",
    customer_name: data.customer_name || null,
    phone: data.phone || null,
    tracking: data.tracking || null,
    channel_sold: data.channel_sold || null,
    loss,
    created_by: createdBy,
    created_at: nowVN(),
    note: data.note || null,
    images: data.images || null,
  });
  if (error) throw error;
  return token;
}

export async function updateReturn(token: string, data: Partial<ReturnRow>) {
  const patch: Partial<ReturnRow> = { ...data };
  if (data.cost !== undefined || data.repair_cost !== undefined || data.sell_price !== undefined) {
    // Pull current to recompute loss
    const { data: cur } = await supabaseAdmin().from("return_log").select("cost, repair_cost, sell_price").eq("token", token).maybeSingle();
    const cost = data.cost ?? cur?.cost ?? 0;
    const repair = data.repair_cost ?? cur?.repair_cost ?? 0;
    const sell = data.sell_price ?? cur?.sell_price ?? 0;
    patch.loss = Math.max(0, toNum(cost) + toNum(repair) - toNum(sell));
  }
  await supabaseAdmin().from("return_log").update(patch).eq("token", token);
}

export async function markSold(token: string, data: {
  sell_price?: number;
  customer_name?: string;
  phone?: string;
  channel_sold?: string;
  tracking?: string;
}) {
  await updateReturn(token, {
    ...data,
    status: "SOLD",
    sold_at: nowVN(),
  });
}
