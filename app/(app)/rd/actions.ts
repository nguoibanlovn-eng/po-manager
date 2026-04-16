"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { deleteRdItem, saveRdItem, updateRdStage, type RdItem } from "@/lib/db/rd";

export async function saveRdItemAction(id: string | null, patch: Partial<RdItem>) {
  const u = await requireUser();
  try {
    const savedId = await saveRdItem(id, {
      ...patch,
      created_by: patch.created_by || u.email,
    });
    revalidatePath("/rd");
    return { ok: true as const, id: savedId };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function updateStageAction(id: string, stage: string) {
  await requireUser();
  await updateRdStage(id, stage);
  revalidatePath("/rd");
  return { ok: true as const };
}

export async function deleteRdItemAction(id: string) {
  const u = await requireUser();
  if (u.role !== "ADMIN" && !u.role.startsWith("LEADER_")) {
    return { ok: false as const, error: "Chỉ leader/admin xoá được." };
  }
  await deleteRdItem(id);
  revalidatePath("/rd");
  return { ok: true as const };
}
