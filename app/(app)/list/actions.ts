"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { hasPermission } from "@/lib/auth/roles";
import {
  advanceStage,
  restoreOrder,
  softDeleteOrder,
} from "@/lib/db/orders";
import type { OrderStage } from "@/lib/types";

export async function deleteOrderAction(orderId: string) {
  const u = await requireUser();
  if (!hasPermission(u, "edit_order") && u.role !== "ADMIN") {
    return { ok: false, error: "Không có quyền xoá đơn." };
  }
  await softDeleteOrder(orderId, u.name || u.email);
  revalidatePath("/list");
  return { ok: true };
}

export async function restoreOrderAction(orderId: string) {
  const u = await requireUser();
  if (u.role !== "ADMIN" && !hasPermission(u, "edit_order")) {
    return { ok: false, error: "Không có quyền khôi phục đơn." };
  }
  await restoreOrder(orderId);
  revalidatePath("/list");
  return { ok: true };
}

export async function advanceStageAction(
  orderId: string,
  newStage: OrderStage,
  note?: string,
) {
  await requireUser();
  await advanceStage(orderId, newStage, note);
  revalidatePath("/list");
  return { ok: true };
}
