"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { createReturn, markSold, updateReturn } from "@/lib/db/returns";
import type { ReturnRow } from "@/lib/db/returns";

export async function createReturnAction(data: Partial<ReturnRow>) {
  const u = await requireUser();
  try {
    const token = await createReturn(data, u.name || u.email);
    revalidatePath("/returns");
    return { ok: true as const, token };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function updateReturnAction(token: string, data: Partial<ReturnRow>) {
  await requireUser();
  await updateReturn(token, data);
  revalidatePath("/returns");
  return { ok: true as const };
}

export async function markReturnSoldAction(token: string, data: Parameters<typeof markSold>[1]) {
  await requireUser();
  await markSold(token, data);
  revalidatePath("/returns");
  return { ok: true as const };
}
