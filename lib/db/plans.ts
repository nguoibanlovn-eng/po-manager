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
