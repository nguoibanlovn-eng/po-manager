"use server";

import { requireUser } from "@/lib/auth/user";
import { hasPermission, isLeader } from "@/lib/auth/roles";
import { revalidatePath } from "next/cache";
import {
  saveBizOrder,
  submitBizOrder,
  approveBizOrder,
  deleteBizOrder,
  type SaveBizOrderPayload,
} from "@/lib/db/biz-orders";

export async function saveBizOrderAction(payload: Omit<SaveBizOrderPayload, "created_by">) {
  const user = await requireUser();
  if (!hasPermission(user, "deploy") && !hasPermission(user, "create_order")) {
    return { ok: false, error: "Không có quyền tạo order." };
  }
  try {
    const id = await saveBizOrder({ ...payload, created_by: user.email });
    revalidatePath("/biz-orders");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function submitBizOrderAction(id: string, approver: string) {
  const user = await requireUser();
  if (!hasPermission(user, "deploy") && !hasPermission(user, "create_order")) {
    return { ok: false, error: "Không có quyền." };
  }
  try {
    await submitBizOrder(id, approver);
    revalidatePath("/biz-orders");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function approveBizOrderAction(
  id: string,
  approved: boolean,
  note?: string,
) {
  const user = await requireUser();
  if (!isLeader(user.role)) {
    return { ok: false, error: "Chỉ Leader/Admin mới được duyệt." };
  }
  try {
    const result = await approveBizOrder(id, approved, user.email, note);
    revalidatePath("/biz-orders");
    revalidatePath("/list");
    revalidatePath("/create");
    return result;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteBizOrderAction(id: string) {
  const user = await requireUser();
  if (!hasPermission(user, "deploy") && user.role !== "ADMIN") {
    return { ok: false, error: "Không có quyền xoá." };
  }
  try {
    await deleteBizOrder(id);
    revalidatePath("/biz-orders");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
