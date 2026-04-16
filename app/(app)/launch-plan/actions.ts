"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { deleteLaunchPlan, saveLaunchPlan, type LaunchPlanRow } from "@/lib/db/plans";

export async function saveLaunchPlanAction(id: string | null, data: Partial<LaunchPlanRow>) {
  const u = await requireUser();
  try {
    const savedId = await saveLaunchPlan(id, data, u.email);
    revalidatePath("/launch-plan");
    return { ok: true as const, id: savedId };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function deleteLaunchPlanAction(id: string) {
  const u = await requireUser();
  if (u.role !== "ADMIN" && !u.role.startsWith("LEADER_")) {
    return { ok: false as const, error: "Chỉ leader/admin xoá được." };
  }
  await deleteLaunchPlan(id);
  revalidatePath("/launch-plan");
  return { ok: true as const };
}
