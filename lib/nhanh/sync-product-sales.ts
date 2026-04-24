import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN, dateVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";
import { nhanhV3FetchAll, nhanhFetchAll } from "./client";

/**
 * Sync product-level sales from Nhanh.vn.
 * V3 order/list (primary, cursor pagination) + V1 /order/index (supplement, page pagination).
 * Per-day: mỗi ngày sync riêng, log chi tiết.
 * SUCCESS_STATUS whitelist giống GAS.
 * Dedup: upsert on (order_id, sku).
 */

const CHANNEL_MAP: Record<string, string> = {
  "0": "Admin", "1": "API", "2": "Facebook", "3": "Zalo",
  "5": "Shopee", "7": "TikTok", "8": "Lazada",
  "10": "Kênh 10", "20": "Shopee Levu01", "21": "Shopee Velasboost",
  "42": "Kênh 42", "48": "TikTok Shop", "100": "Web/App",
};

// Không cần status filter — lọc theo deliveryAt = chỉ đơn đã giao thành công

type V3Order = {
  info?: { id?: string | number; status?: string | number; createdAt?: string | number };
  channel?: { saleChannel?: string | number };
  customer?: { customerId?: string | number; customerMobile?: string };
  customerId?: string | number;
  customerMobile?: string;
  products?: unknown;
};

type V1Order = {
  id?: string | number; orderId?: string | number;
  statusCode?: string | number; status?: string | number;
  channel?: string | number; saleChannel?: string | number;
  createdDateTime?: string;
  customerId?: string | number; customerMobile?: string;
  products?: unknown; orderDetails?: unknown; items?: unknown;
};

type Row = {
  date: string; sku: string; product_name: string; order_id: string;
  channel: string; channel_name: string; qty: number; unit_price: number;
  revenue: number; status: string; synced_at: string; customer_id: string;
};

function parseProducts(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

// ─── V3: 1 ngày (theo ngày giao hàng thành công) ──
async function syncV3Day(date: string): Promise<{ orders: number; rows: Row[]; skipped: number; log: string }> {
  const fromTs = Math.floor(new Date(date + "T00:00:00+07:00").getTime() / 1000);
  const toTs = Math.floor(new Date(date + "T23:59:59+07:00").getTime() / 1000);

  // Lọc theo deliveryAt = chỉ đơn đã giao thành công
  const orders = await nhanhV3FetchAll<V3Order>("order/list", {
    filters: { deliveryAtFrom: fromTs, deliveryAtTo: toTs },
  }, { maxPages: 200 });

  const now = nowVN();
  const rows: Row[] = [];
  let skipped = 0;
  const channels: Record<string, number> = {};

  for (const o of orders) {
    const info = o.info || {};
    const orderId = String(info.id || "");
    if (!orderId) { skipped++; continue; }

    const chCode = String(o.channel?.saleChannel || "0");
    const chName = CHANNEL_MAP[chCode] || `Kênh ${chCode}`;
    const customerId = String(o.customer?.customerId || o.customerId || o.customerMobile || "");
    // Dùng ngày giao (delivery date) làm ngày bán — không dùng createdAt
    const orderDate = date;

    for (const p of parseProducts(o.products)) {
      const sku = String(p.barcode || p.code || "").trim();
      const qty = toNum(p.quantity || p.qty);
      const price = toNum(p.price || p.displaySalePrice);
      const discount = toNum(p.discount);
      if (!sku || qty <= 0) continue;
      // Revenue = (price - discount) × qty — doanh thu thực sau giảm giá
      const revenue = (price - discount) * qty;
      rows.push({
        date: orderDate, sku, product_name: String(p.name || ""), order_id: orderId,
        channel: chCode, channel_name: chName,
        qty, unit_price: price, revenue, status: String(info.status || "delivered"), synced_at: now,
        customer_id: customerId,
      });
      channels[chName] = (channels[chName] || 0) + qty;
    }
  }

  const chStr = Object.entries(channels).map(([k, v]) => `${k}:${v}`).join(", ");
  const log = `V3 ${date}: ${orders.length} orders → ${rows.length} rows (skip ${skipped}) [${chStr}]`;
  return { orders: orders.length, rows, skipped, log };
}

// ─── V1: 1 ngày (supplement — lấy đơn V3 miss, theo ngày giao) ──
async function syncV1Day(date: string): Promise<{ orders: number; rows: Row[]; log: string }> {
  const orders = await nhanhFetchAll<V1Order>("/order/index", {
    filters: { deliveryFrom: date, deliveryTo: date },
  }, 30); // max 30 pages

  const now = nowVN();
  const rows: Row[] = [];
  const channels: Record<string, number> = {};
  let noSku = 0;

  for (const o of orders) {
    const orderId = String(o.id || o.orderId || "");
    const chCode = String(o.channel || o.saleChannel || "0");
    const chName = CHANNEL_MAP[chCode] || `Kênh ${chCode}`;
    const status = String(o.statusCode || o.status || "");
    const orderDate = String(o.createdDateTime || date).substring(0, 10);
    const customerId = String(o.customerId || o.customerMobile || "");

    const products = parseProducts(o.products || o.orderDetails || o.items);
    for (const item of products) {
      const sku = String(item.productBarcode || item.productCode || item.sku || item.code || item.barcode || "").trim();
      if (!sku) { noSku++; continue; }
      const name = String(item.productName || item.name || "");
      const qty = toNum(item.quantity || item.qty);
      const price = toNum(item.price || item.unitPrice);
      if (qty <= 0) continue;
      rows.push({
        date: orderDate, sku, product_name: name, order_id: orderId,
        channel: chCode, channel_name: chName,
        qty, unit_price: price, revenue: qty * price, status, synced_at: now,
        customer_id: customerId,
      });
      channels[chName] = (channels[chName] || 0) + qty;
    }
  }

  const chStr = Object.entries(channels).map(([k, v]) => `${k}:${v}`).join(", ");
  const log = `V1 ${date}: ${orders.length} orders → ${rows.length} rows (noSku:${noSku}) [${chStr}]`;
  return { orders: orders.length, rows, log };
}

// ─── UPSERT ──
async function upsertRows(rows: Row[]): Promise<number> {
  if (rows.length === 0) return 0;
  const db = supabaseAdmin();
  let upserted = 0;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await db.from("product_sales").upsert(chunk, { onConflict: "order_id,sku" });
    if (error) console.warn("upsert error:", error.message);
    else upserted += chunk.length;
  }
  return upserted;
}

// ─── MAIN ──
export async function syncProductSales(opts: {
  from?: string; to?: string;
} = {}): Promise<{ totalOrders: number; totalRows: number; days: number; errors: string[]; logs: string[] }> {
  const to = opts.to || dateVN(null, -1);
  const from = opts.from || dateVN(null, -7);

  const errors: string[] = [];
  const logs: string[] = [];
  let totalOrders = 0, totalRows = 0, days = 0;

  let cursor = from;
  while (cursor <= to) {
    try {
      // V3 primary
      const v3 = await syncV3Day(cursor);
      const v3u = await upsertRows(v3.rows);
      logs.push(v3.log);
      console.log(v3.log);

      // V1 supplement
      const v1 = await syncV1Day(cursor);
      const v1u = await upsertRows(v1.rows);
      logs.push(v1.log);
      console.log(v1.log);

      totalOrders += v3.orders + v1.orders;
      totalRows += v3u + v1u;
      days++;

      const dayTotal = v3.rows.length + v1.rows.length;
      const upsertTotal = v3u + v1u;
      logs.push(`  → ${cursor}: ${dayTotal} rows, ${upsertTotal} upserted (dedup)`);

      await new Promise((r) => setTimeout(r, 100));
    } catch (e) {
      const msg = `${cursor}: ${(e as Error).message}`;
      errors.push(msg);
      logs.push(`ERROR ${msg}`);
    }
    cursor = addDays(cursor, 1);
  }

  return { totalOrders, totalRows, days, errors, logs };
}
