import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";
import type { Item, Order } from "@/lib/types";

// ─── DEBT ────────────────────────────────────────────────────
export async function listDebtOrders(): Promise<Order[]> {
  const { data } = await supabaseAdmin()
    .from("orders")
    .select("*")
    .eq("is_deleted", false)
    .neq("pay_status", "Đã thanh toán")
    .order("order_date", { ascending: false })
    .limit(500);
  return (data as Order[]) || [];
}

export async function updatePayment(
  orderId: string,
  fields: {
    pay_status?: string;
    deposit_amount?: number;
    payment_date?: string | null;
    finance_note?: string;
  },
) {
  await supabaseAdmin()
    .from("orders")
    .update({ ...fields, updated_at: nowVN() })
    .eq("order_id", orderId);
}

// ─── DAMAGE ITEMS ────────────────────────────────────────────
export type DamageItem = Item & {
  order_name?: string | null;
  supplier_name?: string | null;
};

export async function listDamageItems(opts: { pending?: boolean } = {}): Promise<DamageItem[]> {
  const db = supabaseAdmin();
  const { data: items = [] } = await db
    .from("items")
    .select("*")
    .eq("is_deleted", false)
    .gt("damage_qty", 0);
  let filtered = (items as Item[]) || [];
  if (opts.pending !== undefined) {
    filtered = filtered.filter((it) =>
      opts.pending ? !it.damage_handled : !!it.damage_handled,
    );
  }
  if (!filtered.length) return [];
  const orderIds = Array.from(new Set(filtered.map((it) => it.order_id)));
  const { data: orders = [] } = await db
    .from("orders")
    .select("order_id, order_name, supplier_name")
    .in("order_id", orderIds);
  const orderMap = new Map(orders?.map((o) => [o.order_id, o]) || []);
  return filtered.map((it) => ({
    ...it,
    order_name: orderMap.get(it.order_id)?.order_name ?? null,
    supplier_name: orderMap.get(it.order_id)?.supplier_name ?? null,
  }));
}

export async function updateDamageItem(
  orderId: string,
  lineId: string,
  fields: Partial<Item>,
) {
  const patch: Partial<Item> = { ...fields };
  // Auto-mark handled when resolution is done
  if (fields.resolution_status === "done") {
    patch.damage_handled = true;
  }
  await supabaseAdmin()
    .from("items")
    .update(patch)
    .eq("order_id", orderId)
    .eq("line_id", lineId);
  // Also recompute order-level totals
  await recalcOrderDamage(orderId);
}

async function recalcOrderDamage(orderId: string) {
  const db = supabaseAdmin();
  const { data: items = [] } = await db
    .from("items")
    .select("damage_amount, return_cost, resolved_amount")
    .eq("order_id", orderId)
    .eq("is_deleted", false);
  const dmg = (items || []).reduce((s, it) => s + toNum(it.damage_amount), 0);
  const ret = (items || []).reduce((s, it) => s + toNum(it.return_cost), 0);
  await db
    .from("orders")
    .update({
      damage_cost_total: dmg,
      return_cost_total: ret,
      total_loss: Math.max(0, dmg - ret),
      updated_at: nowVN(),
    })
    .eq("order_id", orderId);
}
