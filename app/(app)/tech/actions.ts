"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { hasPermission } from "@/lib/auth/roles";
import { saveQc, confirmShelfAndAdvance } from "@/lib/db/tech";

export async function saveQcAction(
  orderId: string,
  patches: Parameters<typeof saveQc>[1],
) {
  const u = await requireUser();
  if (!hasPermission(u, "qc")) return { ok: false as const, error: "Không có quyền QC." };
  await saveQc(orderId, patches);
  revalidatePath("/tech");
  revalidatePath("/list");
  return { ok: true as const };
}

export async function confirmShelfAction(orderId: string) {
  const u = await requireUser();
  if (!hasPermission(u, "shelf")) return { ok: false as const, error: "Không có quyền xác nhận lên kệ." };
  await confirmShelfAndAdvance(orderId);
  revalidatePath("/tech");
  revalidatePath("/list");
  return { ok: true as const };
}
