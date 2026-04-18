import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN, dateVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";
import { nhanhV3FetchAll } from "./client";

/**
 * Sync product-level sales from Nhanh.vn V3 order/list.
 * Per-day chunks, không lọc status, cursor pagination.
 * Dedup: upsert on (order_id, sku).
 */

const CHANNEL_MAP: Record<string, string> = {
  "0": "Admin", "1": "API", "2": "Facebook", "3": "Zalo",
  "5": "Shopee", "7": "TikTok", "8": "Lazada",
  "10": "Kênh 10", "20": "Shopee Levu01", "21": "Shopee Velasboost",
  "42": "Kênh 42", "48": "TikTok Shop", "100": "Web/App",
};

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

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

// ─── V3: 1 ngày, cursor pagination ──
async function syncV3Day(date: string): Promise<{ orders: number; rows: Row[] }> {
  const fromTs = Math.floor(new Date(date + "T00:00:00+07:00").getTime() / 1000);
  const toTs = Math.floor(new Date(date + "T23:59:59+07:00").getTime() / 1000);

  const orders = await nhanhV3FetchAll<V3Order>("order/list", {
    filters: { createdAtFrom: fromTs, createdAtTo: toTs },
  }, { maxPages: 200 });

  const now = nowVN();
  const rows: Row[] = [];

  for (const o of orders) {
    const info = o.info || {};
    const orderId = String(info.id || "");
    const status = String(info.status || "");
    const chCode = String(o.channel?.saleChannel || "0");
    let orderDate = date;
    if (info.createdAt) {
      try {
        const ts = Number(info.createdAt);
        if (ts > 1e9) {
          orderDate = new Date(ts * 1000).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
        }
      } catch { /* */ }
    }

    for (const p of parseProducts(o.products)) {
      const sku = String(p.barcode || p.code || "").trim();
      const qty = toNum(p.quantity || p.qty);
      // Giá thực: priceAfterVAT (sau discount) > price - discount > price
      const discount = toNum(p.discount || p.discountAmount);
      const rawPrice = toNum(p.price || p.displaySalePrice || p.originalPrice);
      const price = toNum(p.priceAfterVAT) || (discount > 0 ? rawPrice - discount : rawPrice);
      if (!sku || qty <= 0) continue;
      rows.push({
        date: orderDate, sku, product_name: String(p.name || ""), order_id: orderId,
        channel: chCode, channel_name: CHANNEL_MAP[chCode] || `Kênh ${chCode}`,
        qty, unit_price: price, revenue: qty * price, status, synced_at: now,
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
 * Per-day sync: V3 + V1 cho mỗi ngày.
 * Frontend gửi 7 ngày/lần → API chạy 7 ngày × (V3 + V1).
 * Dedup upsert nên V3+V1 không trùng.
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
    try {
      const result = await syncV3Day(cursor);
      const upserted = await upsertRows(result.rows);
      totalOrders += result.orders;
      totalRows += upserted;
      days++;
      console.log(`[sync] ${cursor}: ${result.orders} orders → ${result.rows.length} rows → ${upserted} upserted`);
      await new Promise((r) => setTimeout(r, 100));
    } catch (e) {
      errors.push(`${cursor}: ${(e as Error).message}`);
    }
    cursor = addDays(cursor, 1);
  }

  return { totalOrders, totalRows, days, errors };
}
