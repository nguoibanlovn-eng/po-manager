import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN, dateVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";
import { nhanhFetchAll } from "./client";

/**
 * Sync product-level sales from Nhanh.vn — dùng V1 /order/index.
 * Giống GAS _syncProductSalesForDate:
 *   - V1 API, KHÔNG lọc status (lấy tất cả đơn)
 *   - SKU = productCode || sku || code (KHÔNG ưu tiên barcode)
 *   - Dedup: upsert on (order_id, sku)
 */

// Channel map mở rộng — giống GAS
const CHANNEL_MAP: Record<string, string> = {
  "0": "Admin", "1": "API", "2": "Facebook", "3": "Zalo",
  "5": "Shopee", "7": "TikTok", "8": "Lazada",
  "10": "Kênh 10", "20": "Shopee Levu01", "21": "Shopee Velasboost",
  "42": "Kênh 42", "48": "TikTok Shop", "100": "Web/App",
};

type V1Order = {
  id?: string | number;
  orderId?: string | number;
  statusCode?: string | number;
  status?: string | number;
  channel?: string | number;
  saleChannel?: string | number;
  createdDateTime?: string;
  products?: unknown;
  orderDetails?: unknown;
  items?: unknown;
};

type Row = {
  date: string; sku: string; product_name: string; order_id: string;
  channel: string; channel_name: string; qty: number; unit_price: number;
  revenue: number; status: string; synced_at: string;
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

// ─── V1: /order/index — giống GAS _syncProductSalesForDate ──
async function syncV1Chunk(from: string, to: string): Promise<{ orders: number; rows: Row[] }> {
  console.log(`[syncV1] ${from}→${to}`);
  const orders = await nhanhFetchAll<V1Order>("/order/index", {
    filters: { createdFrom: from, createdTo: to },
  }, 200);
  console.log(`[syncV1] Got ${orders.length} orders`);

  const now = nowVN();
  const rows: Row[] = [];

  for (const o of orders) {
    const orderId = String(o.id || o.orderId || "");
    const chCode = String(o.channel || o.saleChannel || "0");
    const chName = CHANNEL_MAP[chCode] || `Kênh ${chCode}`;
    const status = String(o.statusCode || o.status || "");
    const orderDate = String(o.createdDateTime || from).substring(0, 10);

    // GAS: o.products || o.orderDetails || o.items
    const products = parseProducts(o.products || o.orderDetails || o.items);
    if (!products.length) continue;

    for (const item of products) {
      // V1: productCode thường null → fallback productBarcode
      const sku = String(item.productCode || item.productBarcode || item.sku || item.code || item.barcode || "").trim();
      const name = String(item.productName || item.name || "");
      const qty = toNum(item.quantity || item.qty);
      const price = toNum(item.price || item.unitPrice);
      if (!sku || qty <= 0) continue;
      rows.push({
        date: orderDate, sku, product_name: name, order_id: orderId,
        channel: chCode, channel_name: chName,
        qty, unit_price: price, revenue: qty * price,
        status, synced_at: now,
      });
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
 * Sync via V1 /order/index — giống GAS daily sync.
 * Chunk 1 ngày (giống GAS _syncProductSalesForDate chạy từng ngày).
 * Không lọc status — lấy tất cả đơn.
 */
export async function syncProductSales(opts: {
  from?: string; to?: string;
} = {}): Promise<{ totalOrders: number; totalRows: number; days: number; errors: string[] }> {
  const to = opts.to || dateVN(null, -1);
  const from = opts.from || dateVN(null, -7);

  const errors: string[] = [];
  let totalOrders = 0, totalRows = 0, days = 0;

  // Chunk 3 ngày (V1 trả ~133 trang/ngày → 3 ngày ≈ 400 trang, maxPages=200)
  let cursor = from;
  while (cursor <= to) {
    const chunkEnd = addDays(cursor, 2) > to ? to : addDays(cursor, 2);
    try {
      const result = await syncV1Chunk(cursor, chunkEnd);
      console.log(`[sync] ${cursor}→${chunkEnd}: ${result.orders} orders, ${result.rows.length} rows`);
      const upserted = await upsertRows(result.rows);
      totalOrders += result.orders;
      totalRows += upserted;
      days++;
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      errors.push(`${cursor}→${chunkEnd}: ${(e as Error).message}`);
    }
    cursor = addDays(chunkEnd, 1);
  }

  return { totalOrders, totalRows, days, errors };
}
