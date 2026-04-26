"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { deleteLaunchPlan, saveLaunchPlan, type LaunchPlanRow } from "@/lib/db/plans";
import { createTask } from "@/lib/db/tasks";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function saveLaunchPlanAction(id: string | null, data: Partial<LaunchPlanRow>) {
  const u = await requireUser();
  try {
    const savedId = await saveLaunchPlan(id, data, u.email);

    // Khi launch lần đầu → tạo task cho người được giao
    if (data.stage === "LAUNCHED") {
      const m = data.metrics as Record<string, unknown> | undefined;
      const handoverTo = m?.handover_to as string;
      const handoverDeadline = m?.handover_deadline as string;
      const productName = data.product_name || "";

      if (handoverTo) {
        // Check xem đã có task cho launch plan này chưa
        const { data: existing } = await supabaseAdmin()
          .from("tasks")
          .select("task_id")
          .eq("note", `launch_plan:${savedId}`)
          .limit(1);

        if (!existing?.length) {
          // Tìm tên người được giao
          const { data: usr } = await supabaseAdmin().from("users").select("name").eq("email", handoverTo).maybeSingle();
          await createTask({
            title: `🚀 Triển khai Launch: ${productName}`,
            description: `Triển khai nội dung & listing cho SP "${productName}". Vào Launch SP → tìm ticket → thực hiện checklist.`,
            assignee_email: handoverTo,
            assignee_name: usr?.name || handoverTo,
            created_by: u.email,
            priority: "HIGH",
            deadline: handoverDeadline || null,
            note: `launch_plan:${savedId}`,
          });
        }
      }
    }

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
