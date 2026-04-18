import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN, dateVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";
import { nhanhV3FetchAll, nhanhFetchAll } from "./client";

/**
 * Sync product-level sales from Nhanh.vn orders.
 *
 * 2 luồng song song (chạy tuần tự):
 *   V3 — Shopee, TikTok Shop, Admin (order/list v3, chunk 3 ngày)
 *   V1 — Facebook/Admin (order/index v1, chunk 7 ngày)
 *
 * Schema: date, sku, product_name, order_id, channel, channel_name, qty, unit_price, revenue, status
 * Dedup: upsert on (order_id, sku) — append only, không xoá data cũ
 */

const CHANNEL_MAP: Record<string, string> = {
  "0": "Admin", "1": "API", "2": "Facebook", "5": "Shopee",
  "20": "Shopee Levu01", "48": "TikTok Shop",
};

// V3: bỏ đơn status kết thúc bằng 7 hoặc 8 (hoàn/huỷ)
function isV3ValidStatus(status: string): boolean {
  const last = status.slice(-1);
  return last !== "7" && last !== "8";
}

// V1 (legacy): whitelist status thành công
const V1_OK_STATUS = new Set([54, 56, 42, 72, 64, 60, 74]);

type V3Order = {
  info?: { id?: string | number; status?: string | number; createdAt?: string | number };
  channel?: { saleChannel?: string | number };
  products?: Array<{ barcode?: string; code?: string; name?: string; quantity?: number | string; price?: number | string; originalPrice?: number | string }>
    | Record<string, { barcode?: string; code?: string; name?: string; quantity?: number | string; price?: number | string; originalPrice?: number | string }>;
};

type V1Order = {
  id?: string | number;
  statusId?: string | number;
  saleChannel?: string | number;
  channel?: { saleChannel?: string | number };
  createdDateTime?: string;
  products?: Array<{ barcode?: string; code?: string; productCode?: string; sku?: string; name?: string; quantity?: number | string; qty?: number | string; price?: number | string; unitPrice?: number | string }>
    | Record<string, { barcode?: string; code?: string; productCode?: string; sku?: string; name?: string; quantity?: number | string; qty?: number | string; price?: number | string; unitPrice?: number | string }>;
};

type Row = {
  date: string; sku: string; product_name: string; order_id: string;
  channel: string; channel_name: string; qty: number; unit_price: number;
  revenue: number; status: string; synced_at: string;
};

function extractSku(p: { barcode?: string; code?: string; productCode?: string; sku?: string }): string {
  // Ưu tiên barcode dạng 2000214xxxxx (>10 ký tự)
  const bc = String(p.barcode || "").trim();
  if (bc.length > 10) return bc;
  return String(p.productCode || p.sku || p.code || bc || "").trim();
}

function parseProducts(products: unknown): Array<{ barcode?: string; code?: string; productCode?: string; sku?: string; name?: string; quantity?: number | string; qty?: number | string; price?: number | string; unitPrice?: number | string; originalPrice?: number | string }> {
  if (Array.isArray(products)) return products;
  if (products && typeof products === "object") return Object.values(products);
  return [];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

// ─── LUỒNG V3: Shopee, TikTok, Admin ───────────────────────
async function syncV3Chunk(fromDate: string, toDate: string): Promise<{ orders: number; rows: Row[] }> {
  const orders = await nhanhV3FetchAll<V3Order>("order/list", {
    filters: { fromDate, toDate },
  }, { maxPages: 100 });

  const now = nowVN();
  const rows: Row[] = [];

  for (const o of orders) {
    const info = o.info || {};
    const orderId = String(info.id || "");
    const status = String(info.status || "");
    if (!isV3ValidStatus(status)) continue;

    const chCode = String(o.channel?.saleChannel || "0");
    let orderDate = fromDate;
    if (info.createdAt) {
      try {
        const ts = Number(info.createdAt);
        if (ts > 1e9) orderDate = new Date(ts * 1000).toISOString().substring(0, 10);
      } catch { /* */ }
    }

    for (const p of parseProducts(o.products)) {
      const sku = extractSku(p);
      const qty = toNum(p.quantity || p.qty);
      const price = toNum(p.price || p.unitPrice || p.originalPrice);
      if (!sku || qty <= 0) continue;
      rows.push({ date: orderDate, sku, product_name: String(p.name || ""), order_id: orderId, channel: chCode, channel_name: CHANNEL_MAP[chCode] || `Kênh ${chCode}`, qty, unit_price: price, revenue: qty * price, status, synced_at: now });
    }
  }

  return { orders: orders.length, rows };
}

// ─── LUỒNG V1: Facebook/Admin ──────────────────────────────
async function syncV1Chunk(from: string, to: string): Promise<{ orders: number; rows: Row[] }> {
  const orders = await nhanhFetchAll<V1Order>("/order/index", {
    filters: { createdFrom: from, createdTo: to },
  }, 30);

  const now = nowVN();
  const rows: Row[] = [];

  for (const o of orders) {
    const orderId = String(o.id || "");
    const statusId = toNum(o.statusId);
    if (!V1_OK_STATUS.has(statusId)) continue;

    const chCode = String(o.saleChannel || o.channel?.saleChannel || "0");
    let orderDate = from;
    if (o.createdDateTime) {
      try { orderDate = new Date(o.createdDateTime).toISOString().substring(0, 10); } catch { /* */ }
    }

    for (const p of parseProducts(o.products)) {
      const sku = extractSku(p);
      const qty = toNum(p.quantity || p.qty);
      const price = toNum(p.price || p.unitPrice);
      if (!sku || qty <= 0) continue;
      rows.push({ date: orderDate, sku, product_name: String(p.name || ""), order_id: orderId, channel: chCode, channel_name: CHANNEL_MAP[chCode] || `Kênh ${chCode}`, qty, unit_price: price, revenue: qty * price, status: String(statusId), synced_at: now });
    }
  }

  return { orders: orders.length, rows };
}

// ─── UPSERT BATCH ──────────────────────────────────────────
async function upsertRows(rows: Row[]): Promise<number> {
  if (rows.length === 0) return 0;
  const db = supabaseAdmin();
  let upserted = 0;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await db.from("product_sales").upsert(chunk, { onConflict: "order_id,sku" });
    if (error) console.warn("product_sales upsert:", error.message);
    else upserted += chunk.length;
  }
  return upserted;
}

// ─── MAIN SYNC ─────────────────────────────────────────────
/**
 * Full sync: V3 (chunk 3 ngày) → V1 (chunk 7 ngày), append only.
 * Default: last 7 days. For 30-day sync, pass from/to.
 */
export async function syncProductSales(opts: {
  from?: string; to?: string;
} = {}): Promise<{ totalOrders: number; totalRows: number; days: number; errors: string[] }> {
  const to = opts.to || dateVN(null, -1);
  const from = opts.from || dateVN(null, -7);

  const errors: string[] = [];
  let totalOrders = 0, totalRows = 0, days = 0;

  // ── V3: chunk 3 ngày ──
  let cursor = from;
  while (cursor <= to) {
    const chunkEnd = addDays(cursor, 2) > to ? to : addDays(cursor, 2);
    try {
      const result = await syncV3Chunk(cursor, chunkEnd);
      const upserted = await upsertRows(result.rows);
      totalOrders += result.orders;
      totalRows += upserted;
      days++;
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      errors.push(`V3 ${cursor}→${chunkEnd}: ${(e as Error).message}`);
    }
    cursor = addDays(chunkEnd, 1);
  }

  // ── V1: chunk 7 ngày (append) ──
  cursor = from;
  while (cursor <= to) {
    const chunkEnd = addDays(cursor, 6) > to ? to : addDays(cursor, 6);
    try {
      const result = await syncV1Chunk(cursor, chunkEnd);
      const upserted = await upsertRows(result.rows);
      totalOrders += result.orders;
      totalRows += upserted;
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      errors.push(`V1 ${cursor}→${chunkEnd}: ${(e as Error).message}`);
    }
    cursor = addDays(chunkEnd, 1);
  }

  return { totalOrders, totalRows, days, errors };
}
