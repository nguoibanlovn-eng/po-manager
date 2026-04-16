import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN } from "@/lib/helpers";
import { parseLinks, stringifyLinks, type Channel, type DeployGroup, type DeployProduct } from "./deploy-types";
export type { Channel, DeployGroup, DeployProduct } from "./deploy-types";

export async function listDeployments(statusFilter?: "pending" | "in_progress" | "done"): Promise<DeployGroup[]> {
  const db = supabaseAdmin();
  let q = db.from("deployments").select("*");
  if (statusFilter) q = q.eq("status", statusFilter);
  const { data: all = [] } = await q;
  if (!all?.length) return [];

  const byOrder = new Map<string, DeployProduct[]>();
  for (const d of all as DeployProduct[]) {
    const oid = d.order_id;
    const arr = byOrder.get(oid) || [];
    arr.push(d);
    byOrder.set(oid, arr);
  }

  const orderIds = Array.from(byOrder.keys());
  const { data: orders = [] } = await db
    .from("orders")
    .select("order_id, order_name, stage, arrival_date, supplier_name, order_total")
    .in("order_id", orderIds);
  const orderMap = new Map(orders?.map((o) => [o.order_id, o]) || []);

  const result: DeployGroup[] = [];
  for (const [oid, products] of byOrder) {
    products.sort((a, b) => {
      const ord: Record<string, number> = { pending: 0, in_progress: 1, done: 2 };
      return (ord[a.status || ""] ?? 0) - (ord[b.status || ""] ?? 0);
    });
    const o = orderMap.get(oid);
    result.push({
      order_id: oid,
      order_name: products[0].order_name || oid,
      order_stage: o?.stage ?? null,
      arrival_date: o?.arrival_date ?? null,
      supplier_name: o?.supplier_name ?? null,
      order_total: o?.order_total ?? null,
      products,
    });
  }
  // pending-first sort
  result.sort((a, b) => {
    const aP = a.products.filter((p) => p.status !== "done").length;
    const bP = b.products.filter((p) => p.status !== "done").length;
    return bP - aP;
  });
  return result;
}

function recomputeStatus(d: Partial<DeployProduct>): string {
  const done = [d.fb_done, d.shopee_done, d.tiktok_done, d.web_done];
  const anyDone = done.some(Boolean);
  const allDone = done.every(Boolean);
  return allDone ? "done" : anyDone ? "in_progress" : "pending";
}

export async function confirmDeployChannel(
  deployId: string,
  channel: Channel,
  link?: string,
) {
  const db = supabaseAdmin();
  const { data: row } = await db
    .from("deployments")
    .select("fb_done, shopee_done, tiktok_done, web_done, fb_links, shopee_links, tiktok_links, web_links")
    .eq("deploy_id", deployId)
    .maybeSingle();
  if (!row) throw new Error("Không tìm thấy deployment " + deployId);

  const linkField = `${channel}_links` as const;
  const existingLinks = parseLinks(row[linkField] as string);
  if (link) existingLinks.push(link);

  const patch: Record<string, unknown> = {
    [`${channel}_done`]: true,
    [`${channel}_done_at`]: nowVN(),
    [linkField]: stringifyLinks(existingLinks),
  };

  const next = { ...row, [`${channel}_done`]: true };
  patch.status = recomputeStatus(next);
  if (patch.status === "done") patch.done_at = nowVN();

  await db.from("deployments").update(patch).eq("deploy_id", deployId);
}

export async function unconfirmDeployChannel(deployId: string, channel: Channel) {
  const db = supabaseAdmin();
  const { data: row } = await db
    .from("deployments")
    .select("fb_done, shopee_done, tiktok_done, web_done")
    .eq("deploy_id", deployId)
    .maybeSingle();
  if (!row) return;
  const patch: Record<string, unknown> = {
    [`${channel}_done`]: false,
    [`${channel}_done_at`]: null,
  };
  const next = { ...row, [`${channel}_done`]: false };
  patch.status = recomputeStatus(next);
  if (patch.status !== "done") patch.done_at = null;
  await db.from("deployments").update(patch).eq("deploy_id", deployId);
}

export async function updateDeployInfo(
  deployId: string,
  data: { product_desc?: string; sell_price?: number; ref_links?: string },
) {
  const info_done = !!(data.product_desc && data.sell_price && data.sell_price > 0);
  await supabaseAdmin()
    .from("deployments")
    .update({ ...data, info_done })
    .eq("deploy_id", deployId);
}

export async function approveDeployPrice(deployId: string, approvedBy: string) {
  await supabaseAdmin()
    .from("deployments")
    .update({ price_approved_by: `${approvedBy} ${nowVN()}` })
    .eq("deploy_id", deployId);
}

