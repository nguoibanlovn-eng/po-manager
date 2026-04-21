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

export async function assignDamageAction(
  orderId: string,
  lineId: string,
  productName: string,
  assigneeEmail: string,
  assigneeName: string,
) {
  const u = await requireUser();
  if (!hasPermission(u, "damage_mgmt") && u.role !== "ADMIN") {
    return { ok: false as const, error: "Không có quyền." };
  }
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const db = supabaseAdmin();
  // Check if already assigned (avoid duplicates)
  const { data: existing } = await db.from("tasks")
    .select("task_id")
    .eq("assignee_email", assigneeEmail)
    .ilike("title", `%${orderId}%${lineId}%`)
    .limit(1);
  if (existing && existing.length > 0) {
    return { ok: false as const, error: "Đã giao cho người này rồi." };
  }
  // Create a task assigned to the employee
  await db.from("tasks").insert({
    title: `🔧 Hàng hỏng: ${productName} [${orderId}#${lineId}]`,
    description: `Đơn ${orderId} · Line ${lineId}\nSản phẩm: ${productName}\nGiao bởi: ${u.name || u.email}\nNgười xử lý: ${assigneeName}`,
    assignee_email: assigneeEmail,
    created_by: u.email,
    status: "OPEN",
    priority: "HIGH",
  });
  revalidatePath("/damage-mgmt");
  revalidatePath("/my-tasks");
  revalidatePath("/tasks");
  return { ok: true as const };
}
