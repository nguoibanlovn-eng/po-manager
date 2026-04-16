import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN } from "@/lib/helpers";
import type { RdItem } from "./rd-types";
export { getPipeline, RESEARCH_PIPELINE, PRODUCTION_PIPELINE } from "./rd-types";
export type { RdItem } from "./rd-types";

export async function listRdItems(stage?: string): Promise<RdItem[]> {
  const db = supabaseAdmin();
  let q = db.from("rd_items").select("*").order("updated_at", { ascending: false, nullsFirst: false });
  if (stage) q = q.eq("stage", stage);
  const { data } = await q.limit(500);
  return (data as RdItem[]) || [];
}

export async function getRdItem(id: string): Promise<RdItem | null> {
  const { data } = await supabaseAdmin().from("rd_items").select("*").eq("id", id).maybeSingle();
  return (data as RdItem) || null;
}

export async function saveRdItem(id: string | null, patch: Partial<RdItem>): Promise<string> {
  const db = supabaseAdmin();
  if (id) {
    await db.from("rd_items").update({ ...patch, updated_at: nowVN() }).eq("id", id);
    return id;
  } else {
    const { data: row, error } = await db
      .from("rd_items")
      .insert({ ...patch, created_at: nowVN(), updated_at: nowVN() })
      .select("id")
      .single();
    if (error) throw error;
    return row.id;
  }
}

export async function updateRdStage(id: string, stage: string) {
  await supabaseAdmin().from("rd_items").update({ stage, updated_at: nowVN() }).eq("id", id);
}

export async function deleteRdItem(id: string) {
  await supabaseAdmin().from("rd_items").delete().eq("id", id);
}

// ─── STEP MANAGEMENT ─────────────────────────────────────────
export async function saveStepData(
  id: string,
  stepKey: string,
  fields: Record<string, unknown>,
) {
  const db = supabaseAdmin();
  const { data: cur } = await db
    .from("rd_items").select("step_data").eq("id", id).maybeSingle();
  const stepData = (cur?.step_data as Record<string, Record<string, unknown>>) || {};
  stepData[stepKey] = { ...stepData[stepKey], ...fields };
  await db.from("rd_items").update({ step_data: stepData, updated_at: nowVN() }).eq("id", id);
}

export async function completeStep(id: string, stepKey: string, nextStepKey?: string) {
  const db = supabaseAdmin();
  const { data: cur } = await db
    .from("rd_items").select("step_completed_at").eq("id", id).maybeSingle();
  const completed = (cur?.step_completed_at as Record<string, string>) || {};
  completed[stepKey] = nowVN();
  await db.from("rd_items").update({
    step_completed_at: completed,
    current_step: nextStepKey || stepKey,
    updated_at: nowVN(),
  }).eq("id", id);
}

export async function updateChecklist(
  id: string,
  stepKey: string,
  checklist: Array<{ label: string; checked: boolean; note?: string }>,
) {
  const db = supabaseAdmin();
  const { data: cur } = await db
    .from("rd_items").select("checklists").eq("id", id).maybeSingle();
  const checklists = (cur?.checklists as Record<string, Array<{ label: string; checked: boolean; note?: string }>>) || {};
  checklists[stepKey] = checklist;
  await db.from("rd_items").update({ checklists, updated_at: nowVN() }).eq("id", id);
}
