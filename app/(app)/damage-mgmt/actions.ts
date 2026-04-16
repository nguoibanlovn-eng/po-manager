"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { hasPermission } from "@/lib/auth/roles";
import { sendDamageTicketToFinance, updateDamageItem } from "@/lib/db/finance";
import type { Item } from "@/lib/types";

export async function updateDamageAction(
  orderId: string,
  lineId: string,
  fields: Partial<Item>,
) {
  const u = await requireUser();
  if (!hasPermission(u, "damage_mgmt") && u.role !== "ADMIN") {
    return { ok: false as const, error: "Không có quyền xử lý hàng hỏng." };
  }
  await updateDamageItem(orderId, lineId, fields);
  revalidatePath("/damage-mgmt");
  revalidatePath("/finance");
  return { ok: true as const };
}

export async function sendTicketAction(orderId: string, lineId: string) {
  const u = await requireUser();
  await sendDamageTicketToFinance(orderId, lineId, u.name || u.email);
  revalidatePath("/damage-mgmt");
  revalidatePath("/finance");
  return { ok: true as const };
}
