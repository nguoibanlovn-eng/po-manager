"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import {
  deleteRdItem, saveRdItem, updateRdStage, getRdItem,
  type RdItem,
} from "@/lib/db/rd";
import { createBlankSteps, getSteps, getStepsKey, isProduction } from "@/lib/db/rd-types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN } from "@/lib/helpers";

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

/** Create blank R&D item with pre-initialized pipeline → returns full item */
export async function createBlankRdItemAction(rdType: string = "research") {
  const u = await requireUser();
  const stepsKey = rdType === "research" ? "new_steps_json" : "mfg_steps_json";
  const steps = createBlankSteps(rdType);

  const id = await saveRdItem(null, {
    name: "SP mới",
    stage: "Đề xuất",
    created_by: u.email,
    data: {
      rd_type: rdType,
      created_by_role: u.role,
      [stepsKey]: steps,
    },
  });

  const item = await getRdItem(id);
  revalidatePath("/rd");
  return { ok: true as const, item };
}

/** Create PO from R&D item → returns order_id */
export async function createPoFromRdAction(rdItemId: string) {
  const u = await requireUser();
  const item = await getRdItem(rdItemId);
  if (!item) return { ok: false as const, error: "R&D item not found" };

  const data = (item.data as Record<string, unknown>) || {};
  const steps = getSteps(item);
  const stepsKey = getStepsKey(item);

  // Extract info from steps
  const datMauStep = steps.find(s => s.label === "Đặt mẫu");
  const nhapStep = steps.find(s => s.label === "Nhập hàng" || s.label === "Nhập?" || s.label === "Đặt hàng");

  const supplier = String(datMauStep?.sample_supplier || data.sample_supplier || "");
  const contact = String(datMauStep?.sample_contact || data.sample_contact || "");
  const qty = Number(nhapStep?.bulk_qty || data.bulk_qty || 0);
  const price = Number(nhapStep?.bulk_price || data.bulk_price || data.price_buy || 0);

  // Generate order_id
  const db = supabaseAdmin();
  const { count } = await db.from("orders").select("*", { count: "exact", head: true });
  const orderId = `PO-${String((count || 0) + 1).padStart(3, "0")}`;

  const { error } = await db.from("orders").insert({
    order_id: orderId,
    order_name: item.name || "SP từ R&D",
    supplier_name: supplier,
    supplier_contact: contact,
    total_qty: qty,
    order_total: qty * price,
    item_count: 1,
    stage: "DRAFT",
    pay_status: "UNPAID",
    owner: u.email,
    created_by: u.email,
    note: `Tạo từ R&D: ${item.name} (${rdItemId})`,
    created_at: nowVN(),
    updated_at: nowVN(),
  });

  if (error) return { ok: false as const, error: error.message };

  // Link PO back to R&D item
  if (nhapStep) {
    nhapStep.linked_bulk_po = orderId;
    const updatedSteps = [...steps];
    await saveRdItem(rdItemId, {
      data: { ...data, [stepsKey]: updatedSteps, linked_po: orderId },
    });
  }

  revalidatePath("/rd");
  revalidatePath("/list");
  return { ok: true as const, orderId };
}

/** Create sample PO from R&D "Đặt mẫu" step → returns order_id */
export async function createSamplePoAction(rdItemId: string) {
  const u = await requireUser();
  const item = await getRdItem(rdItemId);
  if (!item) return { ok: false as const, error: "R&D item not found" };

  const data = (item.data as Record<string, unknown>) || {};
  const steps = getSteps(item);
  const stepsKey = getStepsKey(item);

  // Already has a linked sample PO?
  if (data.linked_sample_po) {
    return { ok: true as const, orderId: String(data.linked_sample_po) };
  }

  const supplier = String(data.sample_supplier || "");
  const contact = String(data.sample_contact || "");
  const qty = Number(data.sample_qty || 0);
  const priceUsd = Number(data.sample_price_usd || 0);

  // Generate order_id
  const db = supabaseAdmin();
  const { count } = await db.from("orders").select("*", { count: "exact", head: true });
  const orderId = `PO-${String((count || 0) + 1).padStart(3, "0")}`;

  const { error } = await db.from("orders").insert({
    order_id: orderId,
    order_name: `[Mẫu] ${item.name || "SP từ R&D"}`,
    supplier_name: supplier,
    supplier_contact: contact,
    total_qty: qty || 1,
    order_total: qty * priceUsd,
    item_count: 1,
    stage: "DRAFT",
    pay_status: "UNPAID",
    owner: u.email,
    created_by: u.email,
    note: `Đơn mẫu từ R&D: ${item.name} (${rdItemId})`,
    eta_date: String(data.sample_eta || ""),
    created_at: nowVN(),
    updated_at: nowVN(),
  });

  if (error) return { ok: false as const, error: error.message };

  // Link sample PO back to R&D item
  await saveRdItem(rdItemId, {
    data: { ...data, [stepsKey]: steps, linked_sample_po: orderId },
  });

  revalidatePath("/rd");
  revalidatePath("/list");
  return { ok: true as const, orderId };
}
