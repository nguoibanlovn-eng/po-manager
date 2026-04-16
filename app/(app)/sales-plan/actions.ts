"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { deleteSalesPlan, saveSalesPlan, type SalesPlanRow } from "@/lib/db/plans";

export async function saveSalesPlanAction(id: string | null, data: Partial<SalesPlanRow>) {
  const u = await requireUser();
  try {
    const savedId = await saveSalesPlan(id, data, u.email);
    revalidatePath("/sales-plan");
    return { ok: true as const, id: savedId };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function deleteSalesPlanAction(id: string) {
  const u = await requireUser();
  if (u.role !== "ADMIN" && !u.role.startsWith("LEADER_")) {
    return { ok: false as const, error: "Chỉ leader/admin xoá được." };
  }
  await deleteSalesPlan(id);
  revalidatePath("/sales-plan");
  return { ok: true as const };
}
