import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN, uid } from "@/lib/helpers";
import { toNum } from "@/lib/format";
import type { Item, Order, OrderListItem, OrderStage } from "@/lib/types";

// ─── LIST ────────────────────────────────────────────────────
export async function listOrders(opts: {
  limit?: number;
  stage?: string;
} = {}): Promise<OrderListItem[]> {
  const db = supabaseAdmin();
  let q = db
    .from("orders")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 500);
  if (opts.stage) q = q.eq("stage", opts.stage);

  const { data: orders, error } = await q;
  if (error) throw error;
  if (!orders?.length) return [];

  const ids = orders.map((o) => o.order_id);
  const { data: items } = await db
    .from("items")
    .select(
      "order_id, product_name, qty, damage_qty, damage_amount, damage_handled",
    )
    .in("order_id", ids)
    .eq("is_deleted", false);

  const byOrder = new Map<string, typeof items>();
  for (const it of items || []) {
    const k = it.order_id;
    const arr = byOrder.get(k) || [];
    arr.push(it);
    byOrder.set(k, arr);
  }

  return orders.map((o): OrderListItem => {
    const its = byOrder.get(o.order_id) || [];
    const dmg =
      toNum(o.damage_cost_total) ||
      its.reduce((s, it) => s + toNum(it.damage_amount), 0);
    const dmgPending =
      dmg > 0 &&
      its.some((it) => toNum(it.damage_qty) > 0 && !it.damage_handled);
    return {
      ...o,
      item_count: toNum(o.item_count) || its.length,
      total_qty: toNum(o.total_qty) || its.reduce((s, it) => s + toNum(it.qty), 0),
      damage_cost_total: dmg,
      has_damage: dmg > 0,
      damage_pending: dmgPending,
      damage_handled_all: dmg > 0 && !dmgPending,
      item_names: its.map((it) => it.product_name || "").filter(Boolean).join(" "),
    };
  });
}

// ─── GET ONE ─────────────────────────────────────────────────
export async function getOrder(orderId: string): Promise<{ order: Order; items: Item[] } | null> {
  const db = supabaseAdmin();
  const { data: order } = await db
    .from("orders")
    .select("*")
    .eq("order_id", orderId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (!order) return null;
  const { data: items = [] } = await db
    .from("items")
    .select("*")
    .eq("order_id", orderId)
    .eq("is_deleted", false)
    .order("stt", { ascending: true });
  return { order: order as Order, items: (items as Item[]) || [] };
}

// ─── SAVE (create or update) ─────────────────────────────────
export type SaveOrderPayload = Partial<Order> & {
  items?: Partial<Item>[];
  created_by?: string;
};

export async function saveOrder(payload: SaveOrderPayload): Promise<string> {
  const db = supabaseAdmin();
  const items = (payload.items || []).filter((it) => {
    const hasName = String(it.product_name || "").trim().length > 0;
    const hasSku = String(it.sku || "").trim().length > 0;
    const hasQty = toNum(it.qty) > 0;
    return hasName || hasSku || hasQty;
  });

  const isNew = !payload.order_id;
  const oid = isNew ? uid("PO") : String(payload.order_id).trim();

  const orderTotal = items.reduce((s, it) => s + toNum(it.qty) * toNum(it.unit_price), 0);
  const dmgTotal = items.reduce((s, it) => s + toNum(it.damage_amount), 0);
  const retTotal = items.reduce((s, it) => s + toNum(it.return_cost), 0);
  const stage =
    payload.stage ||
    (payload.arrival_date ? "ARRIVED" : isNew ? "DRAFT" : "ORDERED");

  const orderRow = {
    order_id: oid,
    ...(isNew ? { created_at: nowVN() } : {}),
    created_by: payload.created_by || null,
    updated_at: nowVN(),
    owner: payload.owner || null,
    order_name: payload.order_name || null,
    supplier_name: payload.supplier_name || null,
    supplier_contact: payload.supplier_contact || null,
    pay_status: payload.pay_status || "Chưa thanh toán",
    deposit_amount: toNum(payload.deposit_amount),
    payment_date: payload.payment_date || null,
    finance_note: payload.finance_note || null,
    order_date: payload.order_date || null,
    eta_date: payload.eta_date || null,
    arrival_date: payload.arrival_date || null,
    item_count: items.length,
    total_qty: items.reduce((s, it) => s + toNum(it.qty), 0),
    order_total: orderTotal,
    return_cost_total: retTotal,
    damage_cost_total: dmgTotal,
    total_loss: Math.max(0, dmgTotal - retTotal),
    stage,
    order_status: payload.order_status || null,
    note: payload.note || null,
    goods_type: payload.goods_type || null,
    is_deleted: false,
    ...(payload.source ? { source: payload.source } : {}),
    ...(payload.assigned_to ? { assigned_to: payload.assigned_to } : {}),
    ...(payload.deadline ? { deadline: payload.deadline } : {}),
    ...(payload.biz_order_id ? { biz_order_id: payload.biz_order_id } : {}),
  };

  const { error: orderErr } = await db
    .from("orders")
    .upsert(orderRow, { onConflict: "order_id" });
  if (orderErr) throw orderErr;

  // Replace items: soft-delete existing, then insert fresh
  await db.from("items").update({ is_deleted: true }).eq("order_id", oid);

  if (items.length > 0) {
    const rows = items.map((it, idx) => ({
      order_id: oid,
      line_id: it.line_id || uid("LI"),
      stt: idx + 1,
      sku: it.sku || null,
      product_name: it.product_name || null,
      link: it.link || null,
      item_type: it.item_type || "Hàng chính",
      qty: toNum(it.qty),
      unit_price: toNum(it.unit_price),
      line_total: toNum(it.qty) * toNum(it.unit_price),
      qc_status: it.qc_status || "Chưa QC",
      damage_qty: toNum(it.damage_qty),
      damage_amount: toNum(it.damage_amount),
      damage_handled: !!it.damage_handled,
      damage_note: it.damage_note || null,
      shelf_done: !!it.shelf_done,
      return_status: it.return_status || "Chưa xử lý",
      return_cost: toNum(it.return_cost),
      note: it.note || null,
      is_deleted: false,
    }));
    const { error: itemsErr } = await db
      .from("items")
      .upsert(rows, { onConflict: "order_id,line_id" });
    if (itemsErr) throw itemsErr;
  }

  // Update supplier stats
  if (payload.supplier_name) {
    await upsertSupplierUse(payload.supplier_name);
  }

  // Auto-tạo phiếu triển khai khi đơn về (best-effort, không block save)
  if (stage === "ARRIVED") {
    try {
      const { createDeploymentsForOrder } = await import("./deploy");
      await createDeploymentsForOrder(oid, payload.created_by || "auto");
    } catch (e) {
      console.warn("Auto-create deployment failed for " + oid + ":", (e as Error).message);
    }
  }

  return oid;
}

async function upsertSupplierUse(name: string) {
  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("suppliers")
    .select("supplier_name, use_count")
    .eq("supplier_name", name)
    .maybeSingle();
  if (existing) {
    await db
      .from("suppliers")
      .update({
        use_count: toNum(existing.use_count) + 1,
        last_used: nowVN(),
        updated_at: nowVN(),
      })
      .eq("supplier_name", name);
  } else {
    await db.from("suppliers").insert({
      supplier_name: name,
      use_count: 1,
      last_used: nowVN(),
      created_at: nowVN(),
      updated_at: nowVN(),
      is_deleted: false,
    });
  }
}

// ─── SOFT DELETE / RESTORE ───────────────────────────────────
export async function softDeleteOrder(orderId: string, deletedBy: string) {
  const db = supabaseAdmin();
  await db
    .from("orders")
    .update({ is_deleted: true, deleted_at: nowVN(), deleted_by: deletedBy })
    .eq("order_id", orderId);
  await db.from("items").update({ is_deleted: true }).eq("order_id", orderId);
}

export async function restoreOrder(orderId: string) {
  const db = supabaseAdmin();
  await db
    .from("orders")
    .update({ is_deleted: false, deleted_at: null, deleted_by: null })
    .eq("order_id", orderId);
  await db.from("items").update({ is_deleted: false }).eq("order_id", orderId);
}

export async function listDeletedOrders() {
  const db = supabaseAdmin();
  const { data } = await db
    .from("orders")
    .select("*")
    .eq("is_deleted", true)
    .order("deleted_at", { ascending: false });
  return (data as Order[]) || [];
}

// ─── ADVANCE STAGE ───────────────────────────────────────────
export async function advanceStage(
  orderId: string,
  newStage: OrderStage,
  appendNote?: string,
) {
  const db = supabaseAdmin();
  const { data: cur } = await db
    .from("orders")
    .select("note")
    .eq("order_id", orderId)
    .maybeSingle();
  const merged = appendNote
    ? (cur?.note ? cur.note + "\n" : "") + `[${nowVN()}] ${appendNote}`
    : cur?.note;
  const { error } = await db
    .from("orders")
    .update({ stage: newStage, updated_at: nowVN(), note: merged })
    .eq("order_id", orderId);
  if (error) throw error;

  // Auto-tạo phiếu triển khai khi đơn chuyển sang ARRIVED (best-effort)
  if (newStage === "ARRIVED") {
    try {
      const { createDeploymentsForOrder } = await import("./deploy");
      await createDeploymentsForOrder(orderId, "auto");
    } catch (e) {
      console.warn("Auto-create deployment failed for " + orderId + ":", (e as Error).message);
    }
  }
}

export async function confirmShelf(orderId: string) {
  return advanceStage(orderId, "ON_SHELF", "Kỹ thuật xác nhận lên kệ");
}
