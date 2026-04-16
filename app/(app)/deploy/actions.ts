"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { hasPermission } from "@/lib/auth/roles";
import {
  approveDeployPrice,
  confirmDeployChannel,
  unconfirmDeployChannel,
  updateDeployInfo,
  type Channel,
} from "@/lib/db/deploy";

export async function confirmChannelAction(deployId: string, channel: Channel, link?: string) {
  const u = await requireUser();
  if (!hasPermission(u, "deploy")) return { ok: false as const, error: "Không có quyền." };
  await confirmDeployChannel(deployId, channel, link);
  revalidatePath("/deploy");
  return { ok: true as const };
}

export async function unconfirmChannelAction(deployId: string, channel: Channel) {
  const u = await requireUser();
  if (!hasPermission(u, "deploy")) return { ok: false as const, error: "Không có quyền." };
  await unconfirmDeployChannel(deployId, channel);
  revalidatePath("/deploy");
  return { ok: true as const };
}

export async function updateInfoAction(
  deployId: string,
  data: { product_desc?: string; sell_price?: number; ref_links?: string },
) {
  const u = await requireUser();
  if (!hasPermission(u, "deploy")) return { ok: false as const, error: "Không có quyền." };
  await updateDeployInfo(deployId, data);
  revalidatePath("/deploy");
  return { ok: true as const };
}

export async function approvePriceAction(deployId: string) {
  const u = await requireUser();
  if (!hasPermission(u, "approve_deploy") && u.role !== "ADMIN") {
    return { ok: false as const, error: "Chỉ leader/admin mới duyệt giá." };
  }
  await approveDeployPrice(deployId, u.name || u.email);
  revalidatePath("/deploy");
  return { ok: true as const };
}
