"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { hasPermission } from "@/lib/auth/roles";
import { saveOrder, softDeleteOrder, advanceStage } from "@/lib/db/orders";
import { approveUnlock, requestUnlock } from "@/lib/db/approval";
import type { SaveOrderPayload } from "@/lib/db/orders";
import type { OrderStage } from "@/lib/types";

export async function saveOrderAction(payload: SaveOrderPayload) {
  const u = await requireUser();
  if (!hasPermission(u, "create_order") && !hasPermission(u, "edit_order")) {
    return { ok: false as const, error: "Không có quyền lưu đơn." };
  }
  try {
    const orderId = await saveOrder({
      ...payload,
      created_by: payload.created_by || u.email,
      owner: payload.owner || u.email,
    });
    revalidatePath("/list");
    revalidatePath("/create");
    return { ok: true as const, order_id: orderId };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function deleteOrderFromForm(orderId: string) {
  const u = await requireUser();
  if (!hasPermission(u, "edit_order") && u.role !== "ADMIN") {
    return { ok: false as const, error: "Không có quyền xoá." };
  }
  await softDeleteOrder(orderId, u.name || u.email);
  revalidatePath("/list");
  redirect("/list");
}

export async function advanceStageFromForm(
  orderId: string,
  newStage: OrderStage,
  note?: string,
) {
  await requireUser();
  await advanceStage(orderId, newStage, note);
  revalidatePath("/list");
  revalidatePath("/create");
  return { ok: true as const };
}

export async function requestUnlockAction(orderId: string, reason: string) {
  const u = await requireUser();
  if (!reason.trim()) return { ok: false as const, error: "Nhập lý do unlock." };
  await requestUnlock(orderId, reason, u.name || u.email);
  revalidatePath(`/create`);
  revalidatePath(`/list`);
  return { ok: true as const };
}

export async function approveUnlockAction(orderId: string, approve: boolean, note?: string) {
  const u = await requireUser();
  if (u.role !== "ADMIN" && !hasPermission(u, "approve_order")) {
    return { ok: false as const, error: "Chỉ leader/admin duyệt được unlock." };
  }
  await approveUnlock(orderId, u.name || u.email, approve, note);
  revalidatePath(`/create`);
  revalidatePath(`/list`);
  return { ok: true as const };
}
