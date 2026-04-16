"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import {
  deleteRdItem, saveRdItem, updateRdStage,
  saveStepData, completeStep, updateChecklist,
  type RdItem,
} from "@/lib/db/rd";

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

export async function saveStepDataAction(id: string, stepKey: string, fields: Record<string, unknown>) {
  await requireUser();
  await saveStepData(id, stepKey, fields);
  revalidatePath("/rd");
  return { ok: true as const };
}

export async function completeStepAction(id: string, stepKey: string, nextStepKey?: string) {
  await requireUser();
  await completeStep(id, stepKey, nextStepKey);
  revalidatePath("/rd");
  return { ok: true as const };
}

export async function updateChecklistAction(
  id: string,
  stepKey: string,
  checklist: Array<{ label: string; checked: boolean; note?: string }>,
) {
  await requireUser();
  await updateChecklist(id, stepKey, checklist);
  revalidatePath("/rd");
  return { ok: true as const };
}
