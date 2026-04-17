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
