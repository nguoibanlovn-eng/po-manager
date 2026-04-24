/**
 * Full sync product sales — chạy local, không timeout.
 * V3 + V1 per day, V1 max 200 pages (thay vì 30 trên Vercel).
 * Chạy: npx tsx scripts/sync-full.ts
 * Hoặc chỉ bổ sung: npx tsx scripts/sync-full.ts --from 2026-01-01 --to 2026-04-18
 */
import { readFileSync } from "fs";

// Load env
const envContent = readFileSync(".env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
}

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const V3_BASE = "https://pos.open.nhanh.vn/v3.0";
const V2_BASE = "https://pos.open.nhanh.vn/api";

const CHANNEL_MAP: Record<string, string> = {
  "0": "Admin", "1": "API", "2": "Facebook", "3": "Zalo",
  "5": "Shopee", "7": "TikTok", "8": "Lazada",
  "10": "Kênh 10", "20": "Shopee Levu01", "21": "Shopee Velasboost",
  "42": "Kênh 42", "48": "TikTok Shop", "100": "Web/App",
};
const SUCCESS_STATUS = new Set([54, 56, 42, 72, 64, 60, 74]);

type Row = {
  date: string; sku: string; product_name: string; order_id: string;
  channel: string; channel_name: string; qty: number; unit_price: number;
  revenue: number; status: string; synced_at: string;
};

function env(k: string): string { return process.env[k] || ""; }
function toNum(v: unknown): number { const n = Number(v); return isNaN(n) ? 0 : n; }

function parseProducts(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

// ─── V3 API ──
async function nhanhV3(path: string, body: Record<string, unknown>) {
  const url = `${V3_BASE}/${path}?appId=${env("NHANH_V3_APP_ID")}&businessId=${env("NHANH_BUSINESS_ID")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: env("NHANH_V3_TOKEN") },
    body: JSON.stringify(body),
  });
  return JSON.parse(await res.text());
}

async function fetchV3Day(date: string): Promise<Row[]> {
  const fromTs = Math.floor(new Date(date + "T00:00:00+07:00").getTime() / 1000);
  const toTs = Math.floor(new Date(date + "T23:59:59+07:00").getTime() / 1000);
  const now = new Date().toISOString().substring(0, 19).replace("T", " ");

  const all: Record<string, unknown>[] = [];
  let cursor: unknown = null;
  for (let page = 1; page <= 200; page++) {
    const b: Record<string, unknown> = {
      filters: { createdAtFrom: fromTs, createdAtTo: toTs },
      paginator: cursor ? { size: 200, next: cursor } : { size: 200 },
    };
    const r = await nhanhV3("order/list", b);
    if (r.code !== 1) break;
    let chunk: unknown[];
    if (Array.isArray(r.data)) chunk = r.data;
    else if (r.data && typeof r.data === "object") chunk = Object.values(r.data);
    else chunk = [];
    all.push(...(chunk as Record<string, unknown>[]));
    cursor = r.paginator?.next ?? null;
    if (!cursor) break;
    await new Promise((res) => setTimeout(res, 80));
  }

  const rows: Row[] = [];
  let skipped = 0;
  for (const o of all) {
    const info = (o.info || {}) as Record<string, unknown>;
    const status = Number(info.status || 0);
    if (!SUCCESS_STATUS.has(status)) { skipped++; continue; }
    const orderId = String(info.id || "");
    const chCode = String((o.channel as Record<string, unknown>)?.saleChannel || "0");
    let orderDate = date;
    if (info.createdAt) {
      const ts = Number(info.createdAt);
      if (ts > 1e9) orderDate = new Date(ts * 1000).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
    }
    for (const p of parseProducts((o as Record<string, unknown>).products)) {
      const sku = String(p.barcode || p.code || "").trim();
      const qty = toNum(p.quantity || p.qty);
      const price = toNum(p.price || p.displaySalePrice);
      if (!sku || qty <= 0) continue;
      rows.push({
        date: orderDate, sku, product_name: String(p.name || ""), order_id: orderId,
        channel: chCode, channel_name: CHANNEL_MAP[chCode] || `Kênh ${chCode}`,
        qty, unit_price: price, revenue: qty * price, status: "success", synced_at: now,
      });
    }
  }

  process.stdout.write(`  V3: ${all.length} orders → ${rows.length} rows (skip ${skipped})`);
  return rows;
}

// ─── V1 API ──
async function nhanhV1(endpoint: string, body: Record<string, unknown>) {
  const params = new URLSearchParams({
    version: "2.0",
    appId: env("NHANH_APP_ID"),
    businessId: env("NHANH_BUSINESS_ID"),
    accessToken: env("NHANH_TOKEN"),
    data: JSON.stringify(body),
  });
  const res = await fetch(V2_BASE + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  return JSON.parse(await res.text());
}

async function fetchV1Day(date: string): Promise<Row[]> {
  const now = new Date().toISOString().substring(0, 19).replace("T", " ");
  const all: Record<string, unknown>[] = [];

  for (let page = 1; page <= 200; page++) {
    const r = await nhanhV1("/order/index", {
      filters: { createdFrom: date, createdTo: date },
      paginator: { page, size: 200 },
    });
    if (!r || r.code !== 1 || !r.data) break;
    const d = r.data as Record<string, unknown>;
    let chunk: unknown[];
    if (d.orders && typeof d.orders === "object") chunk = Object.values(d.orders as Record<string, unknown>);
    else if (Array.isArray(r.data)) chunk = r.data;
    else chunk = Object.values(r.data as Record<string, unknown>);
    all.push(...(chunk as Record<string, unknown>[]));
    const totalPages = Number(d.totalPages) || 1;
    if (page >= totalPages) break;
    await new Promise((res) => setTimeout(res, 80));
  }

  const rows: Row[] = [];
  let noSku = 0;
  for (const o of all) {
    const orderId = String(o.id || o.orderId || "");
    const chCode = String(o.channel || o.saleChannel || "0");
    const chName = CHANNEL_MAP[chCode] || `Kênh ${chCode}`;
    const status = String(o.statusCode || o.status || "");
    const orderDate = String(o.createdDateTime || date).substring(0, 10);
    const products = parseProducts(o.products || o.orderDetails || o.items);
    for (const item of products) {
      const sku = String(item.productBarcode || item.productCode || item.sku || item.code || item.barcode || "").trim();
      if (!sku) { noSku++; continue; }
      const qty = toNum(item.quantity || item.qty);
      const price = toNum(item.price || item.unitPrice);
      if (qty <= 0) continue;
      rows.push({
        date: orderDate, sku, product_name: String(item.productName || item.name || ""), order_id: orderId,
        channel: chCode, channel_name: chName,
        qty, unit_price: price, revenue: qty * price, status, synced_at: now,
      });
    }
  }

  process.stdout.write(` | V1: ${all.length} orders → ${rows.length} rows (noSku:${noSku})`);
  return rows;
}

// ─── UPSERT ──
async function upsertRows(rows: Row[]): Promise<number> {
  if (rows.length === 0) return 0;
  let upserted = 0;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("product_sales").upsert(chunk, { onConflict: "order_id,sku" });
    if (error) console.warn("  upsert error:", error.message);
    else upserted += chunk.length;
  }
  return upserted;
}

// ─── MAIN ──
async function main() {
  const args = process.argv.slice(2);
  let from = "2026-01-01";
  let to = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) from = args[i + 1];
    if (args[i] === "--to" && args[i + 1]) to = args[i + 1];
  }

  console.log(`\n=== Full Sync: ${from} → ${to} ===\n`);

  let totalRows = 0;
  let cursor = from;
  let day = 0;

  while (cursor <= to) {
    day++;
    process.stdout.write(`[${day}] ${cursor}:`);

    try {
      const v3rows = await fetchV3Day(cursor);
      const v3u = await upsertRows(v3rows);

      // V1 riêng — nếu lỗi thì V3 vẫn giữ
      let v1u = 0;
      try {
        const v1rows = await fetchV1Day(cursor);
        v1u = await upsertRows(v1rows);
      } catch (e) {
        process.stdout.write(` | V1 ERR: ${(e as Error).message.substring(0, 60)}`);
      }

      totalRows += v3u + v1u;
      console.log(` → ${v3u + v1u} upserted (total: ${totalRows.toLocaleString()})`);
    } catch (e) {
      console.log(` ERROR: ${(e as Error).message}`);
    }

    // Next day
    const d = new Date(cursor + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    cursor = d.toISOString().substring(0, 10);

    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`\n=== DONE: ${totalRows.toLocaleString()} total rows ===\n`);

  // Compare with GAS reference
  try {
    const gas = JSON.parse(readFileSync("reference/gas_daily_summary.json", "utf-8"));
    let gasTotal = 0;
    for (const d of Object.values(gas.data) as Array<{ qty: number }>) gasTotal += d.qty;
    console.log(`GAS reference: ${gasTotal.toLocaleString()} qty`);
    console.log(`Our data: ${totalRows.toLocaleString()} rows`);
    console.log(`Coverage: ${((totalRows / gasTotal) * 100).toFixed(1)}%`);
  } catch { /* no reference file */ }
}

main().catch(console.error);
