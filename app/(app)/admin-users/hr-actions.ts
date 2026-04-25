"use server";

import { requireUser } from "@/lib/auth/user";
import { saveEvaluation, deleteEvaluation } from "@/lib/db/hr";
import { revalidatePath } from "next/cache";

export async function saveEvaluationAction(data: {
  email: string;
  period: string;
  kpi_percent: number;
  quality: number;
  attitude: number;
  note?: string;
}) {
  const user = await requireUser();
  if (user.role !== "ADMIN" && !user.role?.startsWith("LEADER_")) {
    return { ok: false, error: "Chỉ Admin/Leader mới được đánh giá." };
  }
  const result = await saveEvaluation({ ...data, evaluated_by: user.email });
  revalidatePath("/admin-users");
  return result;
}

export async function deleteEvaluationAction(id: string) {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Admin only" };
  await deleteEvaluation(id);
  revalidatePath("/admin-users");
  return { ok: true };
}
