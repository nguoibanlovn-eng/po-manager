import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type SalesSyncRow = {
  id: string;
  channel: string;
  source: string;
  period_from: string;
  period_to: string;
  order_total: number | null;
  order_cancel: number | null;
  order_net: number | null;
  revenue_total: number | null;
  revenue_cancel: number | null;
  revenue_net: number | null;
  order_success: number | null;
  revenue_success: number | null;
  synced_at: string | null;
};

// Channels associated with web/api/B2B traffic
const WEB_CHANNELS = ["API", "Website", "Haravan", "Sapo", "Shopify"];

export async function listWebAppSales(opts: { from?: string; to?: string } = {}): Promise<SalesSyncRow[]> {
  const db = supabaseAdmin();
  let q = db.from("sales_sync").select("*").in("channel", WEB_CHANNELS).order("period_from", { ascending: false });
  if (opts.from) q = q.gte("period_from", opts.from);
  if (opts.to) q = q.lte("period_to", opts.to);
  const { data } = await q.limit(2000);
  return (data as SalesSyncRow[]) || [];
}

export async function listAllChannels(): Promise<string[]> {
  const db = supabaseAdmin();
  const { data } = await db.from("sales_sync").select("channel");
  const set = new Set<string>();
  for (const r of data || []) if (r.channel) set.add(r.channel);
  return Array.from(set).sort();
}

export async function listSalesSync(opts: { channel?: string; from?: string; to?: string } = {}): Promise<SalesSyncRow[]> {
  const db = supabaseAdmin();
  let q = db.from("sales_sync").select("*").order("period_from", { ascending: false });
  if (opts.channel) q = q.eq("channel", opts.channel);
  if (opts.from) q = q.gte("period_from", opts.from);
  if (opts.to) q = q.lte("period_to", opts.to);
  const { data } = await q.limit(5000);
  return (data as SalesSyncRow[]) || [];
}
