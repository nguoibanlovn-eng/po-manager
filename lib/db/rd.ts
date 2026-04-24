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
  const items = (data as RdItem[]) || [];
  // Backfill sample_eta from linked PO for items missing it
  await enrichSampleEta(db, items);
  return items;
}

export async function getRdItem(id: string): Promise<RdItem | null> {
  const db = supabaseAdmin();
  const { data } = await db.from("rd_items").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const items = [data as RdItem];
  await enrichSampleEta(db, items);
  return items[0];
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

// Backfill sample_eta from linked PO orders for items that have linked_sample_po but no sample_eta
async function enrichSampleEta(db: ReturnType<typeof supabaseAdmin>, items: RdItem[]) {
  const needEta = items.filter((it) => {
    const d = (it.data as Record<string, unknown>) || {};
    return d.linked_sample_po && !d.sample_eta;
  });
  if (needEta.length === 0) return;

  const poIds = needEta.map((it) => String(((it.data as Record<string, unknown>).linked_sample_po)));
  const { data: orders } = await db
    .from("orders")
    .select("order_id, eta_date")
    .in("order_id", poIds);

  if (!orders?.length) return;
  const etaMap = new Map<string, string>();
  for (const o of orders) {
    if (o.eta_date) etaMap.set(o.order_id, String(o.eta_date).substring(0, 10));
  }

  for (const it of needEta) {
    const d = (it.data as Record<string, unknown>) || {};
    const poId = String(d.linked_sample_po);
    const eta = etaMap.get(poId);
    if (eta) {
      (it.data as Record<string, unknown>).sample_eta = eta;
    }
  }
}
