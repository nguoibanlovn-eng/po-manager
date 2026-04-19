/**
 * Import product sales từ 3 file xlsx offline vào Supabase.
 * Chạy: npx tsx scripts/import-sales-xlsx.ts
 */
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Load .env.local manually
const envContent = readFileSync(".env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Row = {
  date: string; sku: string; product_name: string; order_id: string;
  channel: string; channel_name: string; qty: number; unit_price: number;
  revenue: number; status: string; synced_at: string;
};

function parseDate(raw: unknown): string {
  if (!raw) return "";
  const s = String(raw);
  // "2026-04-18 18:20:00" or "18/04/2026 15:42:34"
  if (s.includes("-") && s.length >= 10) return s.substring(0, 10);
  if (s.includes("/")) {
    const parts = s.split(/[\s/]/);
    if (parts.length >= 3) return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  // Excel serial date number
  const n = Number(raw);
  if (n > 40000 && n < 60000) {
    const d = new Date((n - 25569) * 86400000);
    return d.toISOString().substring(0, 10);
  }
  return "";
}

const now = new Date().toISOString().substring(0, 19).replace("T", " ");

function parseTikTok(filePath: string): Row[] {
  console.log("Reading TikTok...");
  const wb = XLSX.readFile(filePath);
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
  console.log(`  ${data.length} rows`);

  const rows: Row[] = [];
  for (const r of data) {
    const sku = String(r["Mã vạch"] || "").trim();
    const qty = Number(r["Số lượng"] || 0);
    const price = Number(r["Giá"] || 0);
    const orderId = String(r["ID"] || "");
    const date = parseDate(r["Ngày thành công"] || r["Thời gian"]);
    const name = String(r["Sản phẩm"] || "");
    if (!sku || qty <= 0 || !date || !orderId) continue;
    rows.push({
      date, sku, product_name: name, order_id: orderId,
      channel: "48", channel_name: "TikTok Shop",
      qty, unit_price: price, revenue: qty * price,
      status: "Thành công", synced_at: now,
    });
  }
  console.log(`  → ${rows.length} valid rows`);
  return rows;
}

function parseShopee(filePath: string): Row[] {
  console.log("Reading Shopee...");
  const wb = XLSX.readFile(filePath);
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
  console.log(`  ${data.length} rows`);

  const rows: Row[] = [];
  for (const r of data) {
    const sku = String(r["Mã vạch"] || "").trim();
    const qty = Number(r["Số lượng"] || 0);
    const price = Number(r["Giá bán"] || 0);
    const orderId = String(r["ID"] || "");
    const name = String(r["Sản phẩm"] || "");
    const seller = String(r["Seller"] || "");
    // Shopee không có date → dùng khoảng chung (sẽ update sau nếu cần)
    const date = "2026-01-01"; // placeholder — cần map từ order date
    const chName = seller.includes("Levu") ? "Shopee Levu01" : "Shopee";
    if (!sku || qty <= 0 || !orderId) continue;
    rows.push({
      date, sku, product_name: name, order_id: orderId,
      channel: chName === "Shopee Levu01" ? "20" : "5", channel_name: chName,
      qty, unit_price: price, revenue: qty * price,
      status: "Thành công", synced_at: now,
    });
  }
  console.log(`  → ${rows.length} valid rows`);
  return rows;
}

function parseNgoaiSan(filePath: string): Row[] {
  console.log("Reading Ngoại sàn...");
  const wb = XLSX.readFile(filePath);
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
  console.log(`  ${data.length} rows`);

  const CHANNEL_MAP: Record<string, string> = {
    Admin: "0", API: "1", Facebook: "2", Zalo: "3", "Web/App": "100",
  };

  const rows: Row[] = [];
  for (const r of data) {
    const sku = String(r["Mã vạch"] || "").trim();
    const qty = Number(r["Số lượng"] || 0);
    const price = Number(r["Giá bán"] || 0);
    const orderId = String(r["ID"] || "");
    const date = parseDate(r["Ngày thành công"] || r["Thời gian"]);
    const name = String(r["Sản phẩm"] || "");
    const source = String(r["Nguồn"] || "Admin");
    const chCode = CHANNEL_MAP[source] || "0";
    if (!sku || qty <= 0 || !date || !orderId) continue;
    rows.push({
      date, sku, product_name: name, order_id: orderId,
      channel: chCode, channel_name: source,
      qty, unit_price: price, revenue: qty * price,
      status: String(r["Trạng thái"] || "Thành công"), synced_at: now,
    });
  }
  console.log(`  → ${rows.length} valid rows`);
  return rows;
}

async function upsertBatch(rows: Row[]): Promise<number> {
  let upserted = 0;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("product_sales").upsert(chunk, { onConflict: "order_id,sku" });
    if (error) {
      console.warn(`  Batch ${Math.floor(i / BATCH)}: ${error.message}`);
    } else {
      upserted += chunk.length;
    }
    if (i % 5000 === 0 && i > 0) console.log(`  Progress: ${i}/${rows.length}`);
  }
  return upserted;
}

async function main() {
  console.log("=== Import Sales from XLSX ===\n");

  // 1. Clear existing data
  console.log("Clearing existing product_sales...");
  const { error: delErr } = await supabase.from("product_sales").delete().gte("date", "2000-01-01");
  if (delErr) { console.error("Delete error:", delErr.message); return; }
  console.log("  Done\n");

  // 2. Parse files
  const tiktok = parseTikTok("reference/tiktok thành công.xlsx");
  const shopee = parseShopee("reference/Sọp pe thành công.xlsx");
  const ngoaisan = parseNgoaiSan("reference/đơn hàng bán ngoại sàn.xlsx");

  const allRows = [...tiktok, ...shopee, ...ngoaisan];
  console.log(`\nTotal: ${allRows.length} rows to upsert\n`);

  // 3. Upsert
  console.log("Upserting TikTok...");
  const t = await upsertBatch(tiktok);
  console.log(`  → ${t} upserted\n`);

  console.log("Upserting Shopee...");
  const s = await upsertBatch(shopee);
  console.log(`  → ${s} upserted\n`);

  console.log("Upserting Ngoại sàn...");
  const n = await upsertBatch(ngoaisan);
  console.log(`  → ${n} upserted\n`);

  console.log(`=== DONE: ${t + s + n} total rows imported ===`);
}

main().catch(console.error);
