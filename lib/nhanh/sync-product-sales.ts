import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN, dateVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";
import { nhanhV3FetchAll } from "./client";

/**
 * Sync product-level sales from Nhanh.vn V3 order/list API.
 * Giống GAS: createdAtFrom/createdAtTo (UNIX timestamp), SUCCESS_STATUS whitelist.
 * Chunk 7 ngày, max 200 trang/chunk.
 * Dedup: upsert on (order_id, sku) — append only.
 */

const CHANNEL_MAP: Record<string, string> = {
  "0": "Admin", "1": "API", "2": "Facebook", "5": "Shopee",
  "20": "Shopee Levu01", "48": "TikTok Shop",
};

// Whitelist status thành công (same as GAS SUCCESS_STATUS)
const SUCCESS_STATUS = new Set([54, 56, 42, 72, 64, 60, 74]);

type V3Order = {
  info?: { id?: string | number; status?: string | number; createdAt?: string | number };
  channel?: { saleChannel?: string | number };
  products?: Array<{ barcode?: string; code?: string; name?: string; quantity?: number | string; price?: number | string; displaySalePrice?: number | string; originalPrice?: number | string }>
    | Record<string, { barcode?: string; code?: string; name?: string; quantity?: number | string; price?: number | string; displaySalePrice?: number | string; originalPrice?: number | string }>;
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

function parseProducts(products: unknown): Array<{ productBarcode?: string; barcode?: string; code?: string; productCode?: string; sku?: string; productName?: string; name?: string; quantity?: number | string; qty?: number | string; price?: number | string; unitPrice?: number | string; displaySalePrice?: number | string; originalPrice?: number | string }> {
  if (Array.isArray(products)) return products;
  if (products && typeof products === "object") return Object.values(products);
  return [];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

// ─── V3: order/list — filter bằng UNIX timestamp (giống GAS) ──
async function syncV3Chunk(fromDate: string, toDate: string): Promise<{ orders: number; rows: Row[] }> {
  // GAS dùng createdAtFrom / createdAtTo (UNIX seconds), KHÔNG phải fromDate/toDate
  const fromTs = Math.floor(new Date(fromDate + "T00:00:00+07:00").getTime() / 1000);
  const toTs = Math.floor(new Date(toDate + "T23:59:59+07:00").getTime() / 1000);

  const orders = await nhanhV3FetchAll<V3Order>("order/list", {
    filters: { createdAtFrom: fromTs, createdAtTo: toTs },
  }, { maxPages: 200 });

  const now = nowVN();
  const rows: Row[] = [];

  for (const o of orders) {
    const info = o.info || {};
    const status = Number(info.status || 0);
    // Whitelist status thành công — giống GAS SUCCESS_STATUS
    if (!SUCCESS_STATUS.has(status)) continue;

    const orderId = String(info.id || "");
    const chCode = String(o.channel?.saleChannel || "0");
    let orderDate = fromDate;
    if (info.createdAt) {
      try {
        const ts = Number(info.createdAt);
        if (ts > 1e9) {
          // Format theo VN timezone giống GAS
          const d = new Date(ts * 1000);
          orderDate = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
        }
      } catch { /* */ }
    }

    for (const p of parseProducts(o.products)) {
      const sku = extractSku(p);
      const qty = toNum(p.quantity || p.qty);
      const price = toNum(p.price || p.displaySalePrice || p.originalPrice);
      if (!sku || qty <= 0) continue;
      rows.push({ date: orderDate, sku, product_name: String(p.name || ""), order_id: orderId, channel: chCode, channel_name: CHANNEL_MAP[chCode] || `Kênh ${chCode}`, qty, unit_price: price, revenue: qty * price, status: "success", synced_at: now });
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
 * Full sync via V3 order/list (giống GAS — chỉ dùng V3).
 * Chunk 7 ngày, max 200 trang/chunk.
 * Default: last 7 days.
 */
export async function syncProductSales(opts: {
  from?: string; to?: string;
} = {}): Promise<{ totalOrders: number; totalRows: number; days: number; errors: string[] }> {
  const to = opts.to || dateVN(null, -1);
  const from = opts.from || dateVN(null, -7);

  const errors: string[] = [];
  let totalOrders = 0, totalRows = 0, days = 0;

  // Chunk 7 ngày (giống GAS: 6 ngày chunk)
  let cursor = from;
  while (cursor <= to) {
    const chunkEnd = addDays(cursor, 6) > to ? to : addDays(cursor, 6);
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

  return { totalOrders, totalRows, days, errors };
}
