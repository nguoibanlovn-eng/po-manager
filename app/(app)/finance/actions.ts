"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { hasPermission } from "@/lib/auth/roles";
import { updateDamageItem, updatePayment } from "@/lib/db/finance";
import type { Item } from "@/lib/types";

export async function updatePaymentAction(
  orderId: string,
  fields: Parameters<typeof updatePayment>[1],
) {
  const u = await requireUser();
  if (!hasPermission(u, "finance")) return { ok: false as const, error: "Không có quyền." };
  await updatePayment(orderId, fields);
  revalidatePath("/finance");
  revalidatePath("/list");
  return { ok: true as const };
}

export async function updateDamageItemAction(
  orderId: string,
  lineId: string,
  fields: Partial<Item>,
) {
  const u = await requireUser();
  if (!hasPermission(u, "finance") && !hasPermission(u, "damage_mgmt")) {
    return { ok: false as const, error: "Không có quyền." };
  }
  await updateDamageItem(orderId, lineId, fields);
  revalidatePath("/finance");
  return { ok: true as const };
}
