import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";
import type { Item, OrderListItem } from "@/lib/types";
import { listOrders, advanceStage } from "./orders";

// Active = stage ARRIVED. Done = QC_DONE / ON_SHELF / SELLING / COMPLETED.
export async function listTechTasks(done = false): Promise<OrderListItem[]> {
  if (!done) return listOrders({ stage: "ARRIVED", limit: 200 });
  const all = await Promise.all([
    listOrders({ stage: "QC_DONE", limit: 100 }),
    listOrders({ stage: "ON_SHELF", limit: 100 }),
    listOrders({ stage: "SELLING", limit: 100 }),
    listOrders({ stage: "COMPLETED", limit: 100 }),
  ]);
  return all.flat();
}

export async function listOrderItemsForQc(orderId: string): Promise<Item[]> {
  const { data } = await supabaseAdmin()
    .from("items")
    .select("*")
    .eq("order_id", orderId)
    .eq("is_deleted", false)
    .order("stt", { ascending: true });
  return (data as Item[]) || [];
}

export async function saveQc(
  orderId: string,
  patches: Array<{
    line_id: string;
    qc_status?: string;
    damage_qty?: number;
    damage_amount?: number;
    damage_note?: string;
    return_status?: string;
    return_cost?: number;
    shelf_done?: boolean;
    note?: string;
  }>,
) {
  const db = supabaseAdmin();
  for (const p of patches) {
    const { line_id, ...rest } = p;
    await db
      .from("items")
      .update(rest)
      .eq("order_id", orderId)
      .eq("line_id", line_id);
  }
  await recalcOrder(orderId);
}

export async function recalcOrder(orderId: string) {
  const db = supabaseAdmin();
  const { data: items = [] } = await db
    .from("items")
    .select("damage_amount, return_cost")
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

export async function confirmShelfAndAdvance(orderId: string) {
  await advanceStage(orderId, "ON_SHELF", "Kỹ thuật xác nhận lên kệ");
}
