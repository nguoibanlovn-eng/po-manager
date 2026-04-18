import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";
import { parseLinks, stringifyLinks, type Channel, type DeployGroup, type DeployProduct } from "./deploy-types";
export type { Channel, DeployGroup, DeployProduct } from "./deploy-types";

// Tạo phiếu triển khai (TK) cho mỗi SP trong đơn khi hàng về.
// Idempotent — nếu đơn đã có phiếu, không tạo thêm.
export async function createDeploymentsForOrder(
  orderId: string,
  createdBy: string,
): Promise<{ created: number; existed: boolean; deployIds: string[] }> {
  const db = supabaseAdmin();
  // Kiểm tra đã có phiếu chưa
  const { data: existing } = await db
    .from("deployments")
    .select("deploy_id")
    .eq("order_id", orderId)
    .limit(1);
  if (existing && existing.length > 0) {
    return { created: 0, existed: true, deployIds: [] };
  }

  // Lấy order + items
  const { data: order } = await db
    .from("orders")
    .select("order_id, order_name")
    .eq("order_id", orderId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (!order) throw new Error("Không tìm thấy đơn " + orderId);

  const { data: items = [] } = await db
    .from("items")
    .select("line_id, sku, product_name, qty, unit_price")
    .eq("order_id", orderId)
    .eq("is_deleted", false);

  const valid = (items || []).filter(
    (it) =>
      (it.product_name && it.product_name.trim()) ||
      (it.sku && String(it.sku).trim()) ||
      toNum(it.unit_price) > 0,
  );
  if (!valid.length) throw new Error("Đơn không có SP hợp lệ để tạo phiếu triển khai");

  const now = nowVN();
  const ts = Date.now().toString().slice(-4);
  const rows = valid.map((it, idx) => ({
    deploy_id: `DP-${orderId}-${ts}-${idx + 1}`,
    order_id: orderId,
    order_name: order.order_name || orderId,
    line_id: it.line_id,
    sku: it.sku || null,
    product_name: it.product_name || null,
    qty: toNum(it.qty),
    unit_price: toNum(it.unit_price),
    fb_done: false,
    fb_links: "[]",
    shopee_done: false,
    shopee_links: "[]",
    tiktok_done: false,
    tiktok_links: "[]",
    web_done: false,
    web_links: "[]",
    status: "pending",
    created_at: now,
    created_by: createdBy,
    info_done: false,
  }));

  const { error } = await db.from("deployments").insert(rows);
  if (error) throw error;
  return { created: rows.length, existed: false, deployIds: rows.map((r) => r.deploy_id) };
}

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
  const db = supabaseAdmin();
  const info_done = !!(data.product_desc && data.sell_price && data.sell_price > 0);
  await db
    .from("deployments")
    .update({ ...data, info_done })
    .eq("deploy_id", deployId);

  // Auto-create launch plan when info is complete
  if (info_done) {
    const { data: deploy } = await db
      .from("deployments")
      .select("deploy_id, sku, product_name, unit_price, sell_price, product_desc, fb_done, shopee_done, tiktok_done, web_done, fb_links, shopee_links, tiktok_links, web_links, created_by")
      .eq("deploy_id", deployId)
      .maybeSingle();
    if (deploy) {
      try {
        const { createLaunchFromDeploy } = await import("./plans");
        await createLaunchFromDeploy(deploy as Parameters<typeof createLaunchFromDeploy>[0], deploy.created_by || "auto");
      } catch (e) {
        console.warn("Auto-create launch plan failed:", (e as Error).message);
      }
    }
  }
}

export async function approveDeployPrice(deployId: string, approvedBy: string) {
  await supabaseAdmin()
    .from("deployments")
    .update({ price_approved_by: `${approvedBy} ${nowVN()}` })
    .eq("deploy_id", deployId);
}

