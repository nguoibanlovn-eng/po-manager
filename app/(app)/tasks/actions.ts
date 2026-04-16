"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { createTask, deleteTask, markTaskDone, updateTask } from "@/lib/db/tasks";
import type { TaskRow } from "@/lib/db/tasks";

export async function createTaskAction(data: Partial<TaskRow>) {
  const u = await requireUser();
  try {
    const taskId = await createTask({ ...data, created_by: u.email });
    revalidatePath("/tasks");
    revalidatePath("/my-tasks");
    return { ok: true as const, taskId };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function updateTaskAction(taskId: string, data: Partial<TaskRow>) {
  await requireUser();
  await updateTask(taskId, data);
  revalidatePath("/tasks");
  revalidatePath("/my-tasks");
  return { ok: true as const };
}

export async function markDoneAction(taskId: string) {
  await requireUser();
  await markTaskDone(taskId);
  revalidatePath("/tasks");
  revalidatePath("/my-tasks");
  return { ok: true as const };
}

export async function deleteTaskAction(taskId: string) {
  const u = await requireUser();
  if (u.role !== "ADMIN" && !u.role.startsWith("LEADER_")) {
    return { ok: false as const, error: "Chỉ leader/admin xoá được task." };
  }
  await deleteTask(taskId);
  revalidatePath("/tasks");
  return { ok: true as const };
}
