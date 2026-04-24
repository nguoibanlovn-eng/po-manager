import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN, uid } from "@/lib/helpers";
import { toNum } from "@/lib/format";
import { saveOrder } from "./orders";

// ─── TYPES ──────────────────────────────────────────────────

export type BizOrder = {
  id: string;
  order_type: "new" | "existing";
  team: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  note: string | null;
  status: "draft" | "pending" | "approved" | "rejected";
  approver: string | null;
  approved_at: string | null;
  approval_note: string | null;
  order_total: number | null;
  item_count: number | null;
  total_qty: number | null;
  po_order_id: string | null;
  is_deleted: boolean | null;
};

export type BizOrderItem = {
  biz_order_id: string;
  line_id: string;
  stt: number | null;
  sku: string | null;
  product_name: string | null;
  qty: number | null;
  unit_price: number | null;
  sell_price: number | null;
  description: string | null;
  ref_link: string | null;
  competitor_link: string | null;
  current_stock: number | null;
  is_deleted: boolean | null;
};

export type BizOrderWithItems = BizOrder & {
  items: BizOrderItem[];
  created_by_name?: string;
  approver_name?: string;
};

// ─── LIST ───────────────────────────────────────────────────

export async function listBizOrders(opts: {
  status?: string;
  team?: string;
  limit?: number;
} = {}): Promise<BizOrderWithItems[]> {
  const db = supabaseAdmin();
  let q = db
    .from("biz_orders")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.status) q = q.eq("status", opts.status);
  if (opts.team) q = q.eq("team", opts.team);

  const { data: orders, error } = await q;
  if (error) throw error;
  if (!orders?.length) return [];

  const ids = orders.map((o) => o.id);
  const { data: items } = await db
    .from("biz_order_items")
    .select("*")
    .in("biz_order_id", ids)
    .eq("is_deleted", false)
    .order("stt", { ascending: true });

  const byOrder = new Map<string, BizOrderItem[]>();
  for (const it of (items || []) as BizOrderItem[]) {
    const arr = byOrder.get(it.biz_order_id) || [];
    arr.push(it);
    byOrder.set(it.biz_order_id, arr);
  }

  // Resolve user names
  const emails = new Set<string>();
  for (const o of orders) {
    if (o.created_by) emails.add(o.created_by);
    if (o.approver) emails.add(o.approver);
  }
  const nameMap = new Map<string, string>();
  if (emails.size > 0) {
    const { data: users } = await db
      .from("users")
      .select("email, name")
      .in("email", [...emails]);
    for (const u of users || []) {
      nameMap.set(u.email, u.name || u.email);
    }
  }

  return orders.map((o): BizOrderWithItems => ({
    ...(o as BizOrder),
    items: byOrder.get(o.id) || [],
    created_by_name: nameMap.get(o.created_by) || o.created_by || "",
    approver_name: o.approver ? (nameMap.get(o.approver) || o.approver) : "",
  }));
}

// ─── GET ONE ────────────────────────────────────────────────

export async function getBizOrder(id: string): Promise<BizOrderWithItems | null> {
  const db = supabaseAdmin();
  const { data: order } = await db
    .from("biz_orders")
    .select("*")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (!order) return null;

  const { data: items } = await db
    .from("biz_order_items")
    .select("*")
    .eq("biz_order_id", id)
    .eq("is_deleted", false)
    .order("stt", { ascending: true });

  // Resolve names
  const emails = [order.created_by, order.approver].filter(Boolean);
  const nameMap = new Map<string, string>();
  if (emails.length) {
    const { data: users } = await db
      .from("users")
      .select("email, name")
      .in("email", emails);
    for (const u of users || []) nameMap.set(u.email, u.name || u.email);
  }

  return {
    ...(order as BizOrder),
    items: (items as BizOrderItem[]) || [],
    created_by_name: nameMap.get(order.created_by) || order.created_by || "",
    approver_name: order.approver ? (nameMap.get(order.approver) || order.approver) : "",
  };
}

// ─── SAVE (create or update) ────────────────────────────────

export type SaveBizOrderPayload = {
  id?: string;
  order_type: "new" | "existing";
  team: string;
  note?: string;
  created_by: string;
  items: Array<Partial<BizOrderItem>>;
};

export async function saveBizOrder(payload: SaveBizOrderPayload): Promise<string> {
  const db = supabaseAdmin();
  const items = payload.items.filter((it) => {
    return (it.product_name?.trim() || it.sku?.trim() || toNum(it.qty) > 0);
  });

  const isNew = !payload.id;
  const id = isNew ? uid("BO") : payload.id!;

  const orderTotal = items.reduce((s, it) => s + toNum(it.qty) * toNum(it.unit_price), 0);
  const totalQty = items.reduce((s, it) => s + toNum(it.qty), 0);

  const row = {
    id,
    order_type: payload.order_type,
    team: payload.team,
    created_by: payload.created_by,
    ...(isNew ? { created_at: nowVN() } : {}),
    updated_at: nowVN(),
    note: payload.note || null,
    status: "draft" as const,
    order_total: orderTotal,
    item_count: items.length,
    total_qty: totalQty,
    is_deleted: false,
  };

  const { error: orderErr } = await db
    .from("biz_orders")
    .upsert(row, { onConflict: "id" });
  if (orderErr) throw orderErr;

  // Replace items
  await db.from("biz_order_items").update({ is_deleted: true }).eq("biz_order_id", id);

  if (items.length > 0) {
    const rows = items.map((it, idx) => ({
      biz_order_id: id,
      line_id: it.line_id || uid("BL"),
      stt: idx + 1,
      sku: it.sku || null,
      product_name: it.product_name || null,
      qty: toNum(it.qty),
      unit_price: toNum(it.unit_price),
      sell_price: toNum(it.sell_price),
      description: it.description || null,
      ref_link: it.ref_link || null,
      competitor_link: it.competitor_link || null,
      current_stock: toNum(it.current_stock),
      is_deleted: false,
    }));
    const { error: itemsErr } = await db
      .from("biz_order_items")
      .upsert(rows, { onConflict: "biz_order_id,line_id" });
    if (itemsErr) throw itemsErr;
  }

  return id;
}

// ─── SUBMIT FOR APPROVAL ────────────────────────────────────

export async function submitBizOrder(id: string, approver: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("biz_orders")
    .update({
      status: "pending",
      approver,
      updated_at: nowVN(),
    })
    .eq("id", id);
  if (error) throw error;

  // Notify approver + finance via pending_notifications
  try {
    await db.from("pending_notifications").insert({
      to_emails: approver,
      order_id: id,
      type: "BIZ_ORDER_PENDING",
      payload: { biz_order_id: id },
      created_at: nowVN(),
    });
    // Also notify finance
    const { data: finUsers } = await db
      .from("users")
      .select("email")
      .eq("is_active", true)
      .or("role.eq.LEADER_KETOAN,role.eq.NV_KETOAN");
    if (finUsers?.length) {
      const finEmails = finUsers.map((u) => u.email).join(",");
      await db.from("pending_notifications").insert({
        to_emails: finEmails,
        order_id: id,
        type: "BIZ_ORDER_FINANCE_INFO",
        payload: { biz_order_id: id },
        created_at: nowVN(),
      });
    }
  } catch {
    // best-effort notification
  }
}

// ─── APPROVE / REJECT ───────────────────────────────────────

export async function approveBizOrder(
  id: string,
  approved: boolean,
  approvedBy: string,
  note?: string,
  assignedTo?: string,
  deadline?: string,
): Promise<{ ok: boolean; po_order_id?: string; error?: string }> {
  const db = supabaseAdmin();

  const bo = await getBizOrder(id);
  if (!bo) return { ok: false, error: "Order not found" };
  if (bo.status !== "pending") return { ok: false, error: "Order không ở trạng thái chờ duyệt" };

  if (!approved) {
    // Reject
    await db.from("biz_orders").update({
      status: "rejected",
      approved_at: nowVN(),
      approval_note: note || null,
      updated_at: nowVN(),
    }).eq("id", id);
    return { ok: true };
  }

  // Approve → create PO
  const orderName = bo.items.map((it) => it.product_name).filter(Boolean).join(", ");
  const poId = await saveOrder({
    order_name: orderName || `Order KD ${bo.id}`,
    created_by: approvedBy,
    owner: bo.created_by || approvedBy,
    note: `Từ order KD: ${bo.id}\nTeam: ${bo.team}\n${bo.note || ""}`,
    goods_type: bo.order_type === "new" ? "Trung Quốc đặt hàng" : "Trung Quốc trữ sẵn",
    stage: "PENDING_PURCHASE",
    source: "biz_order",
    biz_order_id: bo.id,
    assigned_to: assignedTo || null,
    deadline: deadline || null,
    items: bo.items.map((it) => ({
      sku: it.sku || undefined,
      product_name: it.product_name || undefined,
      qty: toNum(it.qty),
      unit_price: toNum(it.unit_price),
      link: it.ref_link || undefined,
      note: it.description || undefined,
      item_type: "Hàng chính",
    })),
  });

  await db.from("biz_orders").update({
    status: "approved",
    approved_at: nowVN(),
    approval_note: note || null,
    po_order_id: poId,
    updated_at: nowVN(),
  }).eq("id", id);

  return { ok: true, po_order_id: poId };
}

// ─── DELETE ─────────────────────────────────────────────────

export async function deleteBizOrder(id: string): Promise<void> {
  const db = supabaseAdmin();
  await db.from("biz_orders").update({ is_deleted: true, updated_at: nowVN() }).eq("id", id);
}
