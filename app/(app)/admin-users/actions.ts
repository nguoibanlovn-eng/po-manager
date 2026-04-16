"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { deleteUser, saveUser, toggleLockUser, type AdminUserRow } from "@/lib/db/admin-users";

async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "ADMIN") throw new Error("Admin only");
  return u;
}

export async function saveUserAction(data: Partial<AdminUserRow>) {
  await requireAdmin();
  try {
    const email = await saveUser(data);
    revalidatePath("/admin-users");
    return { ok: true as const, email };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function toggleLockAction(email: string, lock: boolean) {
  const u = await requireAdmin();
  await toggleLockUser(email, lock, u.email);
  revalidatePath("/admin-users");
  return { ok: true as const };
}

export async function deleteUserAction(email: string) {
  await requireAdmin();
  await deleteUser(email);
  revalidatePath("/admin-users");
  return { ok: true as const };
}
