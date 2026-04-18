import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN, dateVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";
import { nhanhV3FetchAll } from "./client";

/**
 * Sync product-level sales from Nhanh.vn V3 order/list.
 * KHÔNG lọc status — lấy tất cả đơn giống GAS daily sync.
 * Dedup: upsert on (order_id, sku).
 */

const CHANNEL_MAP: Record<string, string> = {
  "0": "Admin", "1": "API", "2": "Facebook", "3": "Zalo",
  "5": "Shopee", "7": "TikTok", "8": "Lazada",
  "10": "Kênh 10", "20": "Shopee Levu01", "21": "Shopee Velasboost",
  "42": "Kênh 42", "48": "TikTok Shop", "100": "Web/App",
};

// Chỉ bỏ đơn hoàn/huỷ rõ ràng (status kết thúc bằng 7 hoặc 8)
function isReturnOrCancel(status: number): boolean {
  const last = status % 10;
  return last === 7 || last === 8;
}

type V3Order = {
  info?: { id?: string | number; status?: string | number; createdAt?: string | number };
  channel?: { saleChannel?: string | number };
  products?: unknown;
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

function extractSkuV3(p: Record<string, unknown>): string {
  // V3: barcode (dạng 2000214xxx) hoặc code
  const bc = String(p.barcode || "").trim();
  if (bc.length > 5) return bc;
  return String(p.code || bc || "").trim();
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

// ─── V3: order/list — UNIX timestamp, cursor pagination ──
async function syncV3Chunk(fromDate: string, toDate: string): Promise<{ orders: number; rows: Row[] }> {
  const fromTs = Math.floor(new Date(fromDate + "T00:00:00+07:00").getTime() / 1000);
  const toTs = Math.floor(new Date(toDate + "T23:59:59+07:00").getTime() / 1000);

  console.log(`[V3] ${fromDate}→${toDate} ts=${fromTs}→${toTs}`);
  const orders = await nhanhV3FetchAll<V3Order>("order/list", {
    filters: { createdAtFrom: fromTs, createdAtTo: toTs },
  }, { maxPages: 200 });
  console.log(`[V3] Got ${orders.length} orders`);

  const now = nowVN();
  const rows: Row[] = [];

  for (const o of orders) {
    const info = o.info || {};
    const status = Number(info.status || 0);
    // Chỉ bỏ đơn hoàn/huỷ (ending 7/8) — giữ tất cả status khác giống GAS daily sync
    if (isReturnOrCancel(status)) continue;

    const orderId = String(info.id || "");
    const chCode = String(o.channel?.saleChannel || "0");
    let orderDate = fromDate;
    if (info.createdAt) {
      try {
        const ts = Number(info.createdAt);
        if (ts > 1e9) {
          const d = new Date(ts * 1000);
          orderDate = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
        }
      } catch { /* */ }
    }

    for (const p of parseProducts(o.products)) {
      const sku = extractSkuV3(p);
      const qty = toNum(p.quantity || p.qty);
      const price = toNum(p.price || p.displaySalePrice || p.originalPrice);
      if (!sku || qty <= 0) continue;
      rows.push({
        date: orderDate, sku, product_name: String(p.name || ""), order_id: orderId,
        channel: chCode, channel_name: CHANNEL_MAP[chCode] || `Kênh ${chCode}`,
        qty, unit_price: price, revenue: qty * price, status: String(status), synced_at: now,
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
 * V3 only — chunk 7 ngày, cursor pagination, max 200 pages.
 */
export async function syncProductSales(opts: {
  from?: string; to?: string;
} = {}): Promise<{ totalOrders: number; totalRows: number; days: number; errors: string[] }> {
  const to = opts.to || dateVN(null, -1);
  const from = opts.from || dateVN(null, -7);

  const errors: string[] = [];
  let totalOrders = 0, totalRows = 0, days = 0;

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
      errors.push(`${cursor}→${chunkEnd}: ${(e as Error).message}`);
    }
    cursor = addDays(chunkEnd, 1);
  }

  return { totalOrders, totalRows, days, errors };
}
