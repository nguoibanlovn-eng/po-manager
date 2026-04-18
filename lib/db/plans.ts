import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN } from "@/lib/helpers";

export type SalesPlanRow = {
  id: string;
  sku: string | null;
  product_name: string | null;
  month_key: string | null;
  channel: string | null;
  qty_target: number | null;
  rev_target: number | null;
  status: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string | null;
};

export type LaunchPlanRow = {
  id: string;
  sku: string | null;
  product_name: string | null;
  stage: string | null;
  launch_date: string | null;
  channels: string | null;
  metrics: Record<string, unknown> | null;
  note: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function listSalesPlans(monthKey?: string): Promise<SalesPlanRow[]> {
  const db = supabaseAdmin();
  let q = db.from("sales_plan").select("*").order("month_key", { ascending: false });
  if (monthKey) q = q.eq("month_key", monthKey);
  const { data } = await q.limit(500);
  return (data as SalesPlanRow[]) || [];
}

export async function saveSalesPlan(id: string | null, data: Partial<SalesPlanRow>, createdBy: string): Promise<string> {
  const db = supabaseAdmin();
  if (id) {
    await db.from("sales_plan").update(data).eq("id", id);
    return id;
  }
  const { data: row, error } = await db
    .from("sales_plan")
    .insert({ ...data, created_by: createdBy, created_at: nowVN() })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function deleteSalesPlan(id: string) {
  await supabaseAdmin().from("sales_plan").delete().eq("id", id);
}

export async function listLaunchPlans(): Promise<LaunchPlanRow[]> {
  const { data } = await supabaseAdmin()
    .from("launch_plan")
    .select("*")
    .order("launch_date", { ascending: false, nullsFirst: false });
  return (data as LaunchPlanRow[]) || [];
}

export async function saveLaunchPlan(id: string | null, data: Partial<LaunchPlanRow>, createdBy: string): Promise<string> {
  const db = supabaseAdmin();
  if (id) {
    await db.from("launch_plan").update({ ...data, updated_at: nowVN() }).eq("id", id);
    return id;
  }
  const { data: row, error } = await db
    .from("launch_plan")
    .insert({ ...data, created_by: createdBy, created_at: nowVN(), updated_at: nowVN() })
    .select("id")
    .single();
  if (error) throw error;
  return row.id;
}

export async function deleteLaunchPlan(id: string) {
  await supabaseAdmin().from("launch_plan").delete().eq("id", id);
}

/** Auto-create launch plan from a completed deployment. Idempotent by deploy_id in metrics. */
export async function createLaunchFromDeploy(deploy: {
  deploy_id: string; sku: string | null; product_name: string | null;
  unit_price: number; sell_price: number; product_desc: string | null;
  fb_done: boolean; shopee_done: boolean; tiktok_done: boolean; web_done: boolean;
  fb_links: string | null; shopee_links: string | null; tiktok_links: string | null; web_links: string | null;
}, createdBy: string): Promise<string | null> {
  const db = supabaseAdmin();

  // Check if already exists for this deploy_id
  const { data: existing } = await db
    .from("launch_plan")
    .select("id")
    .contains("metrics", { deploy_id: deploy.deploy_id })
    .limit(1);
  if (existing && existing.length > 0) return existing[0].id;

  const channels: string[] = [];
  const listings: Record<string, { links: string[]; done: boolean }> = {};
  for (const [ch, key, linkKey] of [
    ["Facebook", "fb_done", "fb_links"],
    ["Shopee", "shopee_done", "shopee_links"],
    ["TikTok Shop", "tiktok_done", "tiktok_links"],
    ["Web/B2B", "web_done", "web_links"],
  ] as const) {
    const done = deploy[key as keyof typeof deploy] as boolean;
    const rawLinks = deploy[linkKey as keyof typeof deploy] as string | null;
    let links: string[] = [];
    try { links = JSON.parse(rawLinks || "[]"); } catch { /* */ }
    if (done || links.length > 0) {
      channels.push(ch);
      listings[ch] = { links, done };
    }
  }

  const metrics = {
    deploy_id: deploy.deploy_id,
    product_type: "medium",
    pricing: { cost: deploy.unit_price, sell_price: deploy.sell_price },
    channels_selected: channels.length > 0 ? channels : ["Facebook", "TikTok Shop", "Shopee"],
    listings,
    product_desc: deploy.product_desc,
  };

  const now = nowVN();
  const { data: row, error } = await db
    .from("launch_plan")
    .insert({
      sku: deploy.sku,
      product_name: deploy.product_name,
      stage: "READY",
      channels: channels.join(","),
      metrics,
      created_by: createdBy,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) { console.warn("Auto-create launch plan failed:", error.message); return null; }
  return row.id;
}
