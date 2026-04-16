import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN } from "@/lib/helpers";
import type { Order } from "@/lib/types";

// Order is "locked" for direct edit once it's past DRAFT.
// BUY team can still edit but Finance/other fields require leader approval.
export function isOrderLocked(order: Pick<Order, "stage" | "is_locked">): boolean {
  if (order.is_locked) return true;
  const stage = String(order.stage || "DRAFT");
  return stage !== "DRAFT" && stage !== "ORDERED";
}

export async function requestUnlock(orderId: string, reason: string, requestedBy: string) {
  const db = supabaseAdmin();
  await db.from("orders").update({
    is_locked: true,
    unlock_requested_by: requestedBy,
    unlock_reason: reason,
    unlock_approved_by: null,
    unlock_approved_at: null,
    updated_at: nowVN(),
  }).eq("order_id", orderId);

  // Also log as a pending notification (leaders see in inbox)
  await db.from("pending_notifications").insert({
    to_emails: "", // leaders resolved separately
    order_id: orderId,
    type: "UNLOCK_REQUEST",
    payload: { reason, requested_by: requestedBy },
  });
}

export async function approveUnlock(orderId: string, approvedBy: string, approve: boolean, note?: string) {
  const db = supabaseAdmin();
  if (approve) {
    await db.from("orders").update({
      is_locked: false,
      unlock_approved_by: approvedBy,
      unlock_approved_at: nowVN(),
      updated_at: nowVN(),
    }).eq("order_id", orderId);
  } else {
    await db.from("orders").update({
      unlock_reason: null,
      unlock_requested_by: null,
      updated_at: nowVN(),
    }).eq("order_id", orderId);
  }
  await db.from("pending_notifications").insert({
    to_emails: "",
    order_id: orderId,
    type: approve ? "UNLOCK_APPROVED" : "UNLOCK_REJECTED",
    payload: { approved_by: approvedBy, note: note || null },
  });
}

export async function listUnlockRequests() {
  const { data } = await supabaseAdmin()
    .from("orders")
    .select("order_id, order_name, supplier_name, stage, unlock_requested_by, unlock_reason, updated_at")
    .eq("is_deleted", false)
    .not("unlock_requested_by", "is", null)
    .is("unlock_approved_by", null)
    .order("updated_at", { ascending: false });
  return data || [];
}
