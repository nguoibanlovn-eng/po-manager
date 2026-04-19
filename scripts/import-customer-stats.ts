/**
 * Import customer stats từ Nhanh Excel export
 * Cập nhật total_orders, total_revenue, last_order_date, city
 * Chạy: npx tsx scripts/import-customer-stats.ts
 */
import { readFileSync } from "fs";
import XLSX from "xlsx";

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

function parseDate(d: string | number | undefined): string | null {
  if (!d) return null;
  const s = String(d);
  // Format: "19/04/2026" or "17/4/2026"
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // Already ISO
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.substring(0, 10);
  return null;
}

async function main() {
  const filePath = process.argv[2] || "/Users/levu/Downloads/Nhanh.vn_Customers_2026-04-19_155243.xlsx";
  console.log(`Reading ${filePath}...`);

  const wb = XLSX.readFile(filePath);
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as Array<Record<string, unknown>>;
  console.log(`${data.length} rows`);

  // Build upsert records — match by customer_id
  const rows: Array<{
    customer_id: string;
    phone: string;
    name: string;
    total_orders: number;
    total_revenue: number;
    last_order_date: string | null;
    city: string | null;
  }> = [];

  for (const r of data) {
    const id = String(r["ID"] || "").trim();
    if (!id) continue;
    const phone = String(r["Số điện thoại"] || "").replace(/^0/, "").trim();

    rows.push({
      customer_id: id,
      phone,
      name: String(r["Tên khách hàng"] || ""),
      total_orders: Number(r["Số lần mua"] || 0),
      total_revenue: Number(r["Tổng tiền"] || 0),
      last_order_date: parseDate(r["Ngày mua gần nhất"] as string),
      city: (r["Thành phố"] as string) || null,
    });
  }

  console.log(`${rows.length} records to upsert`);

  // Batch upsert by customer_id
  let upserted = 0, errors = 0;
  const BATCH = 500;

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("customers").upsert(chunk, { onConflict: "customer_id" });
    if (error) { errors++; console.warn("  upsert error:", error.message); }
    else upserted += chunk.length;

    if ((i / BATCH) % 10 === 0) {
      process.stdout.write(`\r  ${i + chunk.length}/${rows.length} — upserted: ${upserted}, errors: ${errors}`);
    }
  }

  console.log(`\n\n=== DONE ===`);
  console.log(`Upserted: ${upserted}`);
  console.log(`Errors: ${errors}`);
}

main().catch(console.error);
