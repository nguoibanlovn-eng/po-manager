#!/usr/bin/env node
// One-shot migration: Google Sheets → Supabase.
// Usage:
//   node scripts/migrate-sheets.mjs               # import everything
//   node scripts/migrate-sheets.mjs suppliers     # import one table
//   node scripts/migrate-sheets.mjs --reset       # truncate all before import
//
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

// ─── env load ────────────────────────────────────────────────
function loadEnv() {
  const p = path.resolve(".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const SHEET_ID = "1qX4FLwJQ7dzaUDwe-_z7V-EDgbLPhe9IR1Su1l6nH_4";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY || KEY.includes("REPLACE")) {
  console.error("Missing SUPABASE envs in .env.local");
  process.exit(1);
}
const db = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── coercion ────────────────────────────────────────────────
// DD/MM/YYYY HH:MM:SS → ISO (assume Asia/Ho_Chi_Minh = +07:00)
// YYYY-MM-DD and YYYY-MM-DD HH:MM:SS → passthrough (Postgres parses)
// TRUE/FALSE → bool
// Empty → null
function coerce(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const dmy = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
  );
  if (dmy) {
    const p = (n) => String(n).padStart(2, "0");
    const [, d, mo, y, h = "0", mi = "0", se = "0"] = dmy;
    return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:${p(se)}+07:00`;
  }
  // YYYY-MM → YYYY-MM-01 (used for monthly aggregate rows in shopee_ads)
  if (/^\d{4}-\d{2}$/.test(s)) return s + "-01";
  // Vietnamese locale decimals: "1872090,99" → 1872090.99. Only if clean.
  if (/^-?\d+,\d{1,4}$/.test(s)) return s.replace(",", ".");
  if (s === "TRUE" || s === "true") return true;
  if (s === "FALSE" || s === "false") return false;
  return s;
}

// Columns that must be boolean regardless of what the sheet put there.
const BOOL_COLS = new Set([
  "damage_handled", "shelf_done", "finance_confirmed", "info_done",
  "is_deleted", "is_active", "is_today",
  "fb_done", "shopee_done", "tiktok_done", "web_done",
  "alerted_1h", "alerted_overdue",
]);

// After coerce(), catch cross-type mistakes (boolean in a timestamp col, random
// text in a boolean col, etc.).
function normalize(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    let nv = v;
    // _at/_date cols can't hold booleans or arbitrary text like "sent"
    if ((k.endsWith("_at") || k.endsWith("_date")) && nv !== null) {
      if (typeof nv === "boolean") nv = null;
      else if (typeof nv === "string") {
        const looksDate =
          /^\d{4}-\d{2}-\d{2}/.test(nv) || /T\d{2}:/.test(nv);
        if (!looksDate) nv = null;
      }
    }
    // bool cols: non-bool → null
    if (BOOL_COLS.has(k) && nv !== null && typeof nv !== "boolean") nv = null;
    out[k] = nv;
  }
  return out;
}

function coerceRow(row) {
  const out = {};
  for (const k of Object.keys(row)) out[k] = coerce(row[k]);
  return out;
}

// ─── sheet fetcher ───────────────────────────────────────────
async function fetchSheetCsv(sheetName) {
  const url =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}` +
    `/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${sheetName} fetch failed: ${resp.status}`);
  const csv = await resp.text();
  if (!csv.trim()) return [];
  const rows = parse(csv, { columns: true, skip_empty_lines: true });
  return rows;
}

// ─── table columns (hardcoded, matches 0001+0002) ────────────
const TABLE_COLS = {
  config: ["grp","key","label","value","sort","is_active"],
  orders: ["order_id","created_at","created_by","updated_at","owner","order_name","supplier_name","supplier_contact","pay_status","deposit_amount","payment_date","finance_note","order_date","eta_date","arrival_date","item_count","total_qty","order_total","return_cost_total","damage_cost_total","total_loss","stage","order_status","note","goods_type","is_deleted","deleted_at","deleted_by","is_locked","unlock_requested_by","unlock_reason","unlock_approved_by","unlock_approved_at"],
  items: ["order_id","line_id","stt","sku","product_name","link","item_type","qty","unit_price","line_total","qc_status","damage_qty","damage_amount","damage_handled","damage_note","shelf_done","return_status","return_cost","note","is_deleted","resolution_type","resolution_status","resolution_evidence","resolved_amount","resolved_date","replacement_bill_id","replacement_qty","liquidation_sku","liquidation_bill_id","finance_confirmed","ticket_sent_at","kt_note","bank_name","bank_account","bank_account_name","refund_method"],
  budgets: ["month_key","team","budget_amount","note"],
  suppliers: ["supplier_name","supplier_contact","use_count","last_used","created_at","updated_at","is_deleted"],
  users: ["email","name","role","team","channels","is_active","extra_permissions","locked_at","locked_by","created_at","note"],
  targets: ["target_id","type","ref_id","assigned_to","month_key","rev_target","qty_target","deadline","note","created_by","created_at"],
  pages: ["page_id","page_name","platform","assigned_email","assigned_name","is_active","last_sync","nhanh_id","ad_account_id","fb_page_id"],
  assignments: ["assign_id","order_id","sku","assigned_email","assigned_name","channel","page_id","status","done_at","note","created_at"],
  sales_sync: ["channel","source","period_from","period_to","order_total","order_cancel","order_net","revenue_total","revenue_cancel","revenue_net","order_success","revenue_success","synced_at"],
  inventory: ["sku","product_name","category","available_qty","in_transit_qty","total_qty","reserved_qty","sold_30d","last_sync"],
  products: ["sku","product_name","category","unit","image_url","cost_price","sell_price","stock","is_active","last_sync"],
  deployments: ["deploy_id","order_id","order_name","line_id","sku","product_name","qty","unit_price","fb_done","fb_done_at","fb_links","shopee_done","shopee_done_at","shopee_links","tiktok_done","tiktok_done_at","tiktok_links","web_done","web_done_at","web_links","status","created_at","done_at","created_by","product_desc","sell_price","price_approved_by","info_done","items_summary","suggested_price","assigned_channels","fb_note","sell_price_proposed","ref_links","market_low","market_high","market_avg","market_link_low","market_link_high","market_link_avg"],
  ads_cache: ["date","ad_account_id","account_name","spend","impressions","clicks","reach","purchase_value","synced_at","is_today"],
  insights_cache: ["date","page_id","page_name","new_fans","lost_fans","net_fans","reach","impressions","synced_at"],
  tiktok_ads: ["date","advertiser_id","advertiser_name","spend","impressions","clicks","reach","conversions","conversion_value","synced_at"],
  tiktok_channel: ["date","account_id","username","followers","new_followers","video_views","likes","comments","shares","synced_at"],
  customers: ["customer_id","name","phone","email","birthday","gender","address","city","total_orders","total_revenue","last_order_date","created_at","synced_at","channels"],
  shopee_ads: ["date","campaign_name","ad_type","spend","impressions","clicks","orders","revenue","roas","synced_at","shop","period_from","period_to"],
  shopee_daily: ["date","shop_id","revenue","orders","synced_at"],
  return_log: ["token","date","product_name","sku","category","condition","description","basket","cost","repair_cost","sell_price","status","customer_name","phone","tracking","channel_sold","loss","created_by","created_at","sold_at","note","images"],
  return_edit_log: ["log_id","action","token","product_name","field_changed","old_value","new_value","changed_by","changed_at","note"],
  sku_info_log: ["sku","product_desc","sell_price","ref_links","market_low","market_high","market_avg","done_by","done_at","deploy_id","note"],
  tasks: ["task_id","title","description","assignee_email","assignee_name","team","created_by","status","priority","deadline","recurring","parent_task_id","alerted_1h","alerted_overdue","note","created_at","updated_at","done_at"],
  tasks_log: ["log_id","task_id","task_title","field","old_value","new_value","changed_by","changed_by_email","changed_at"],
  rd_items: ["id","name","source_url","stage","data","note","created_by","created_at","updated_at"],
};

// Primary-key / conflict columns (for null filtering).
const PK_COLS = {
  config: ["grp", "key"],
  orders: ["order_id"],
  items: ["order_id", "line_id"],
  budgets: ["month_key", "team"],
  suppliers: ["supplier_name"],
  users: ["email"],
  targets: ["target_id"],
  pages: ["page_id"],
  assignments: ["assign_id"],
  sales_sync: ["channel", "source", "period_from", "period_to"],
  inventory: ["sku"],
  products: ["sku"],
  deployments: ["deploy_id"],
  ads_cache: ["date", "ad_account_id"],
  insights_cache: ["date", "page_id"],
  tiktok_ads: ["date", "advertiser_id"],
  tiktok_channel: ["date", "account_id"],
  customers: ["customer_id"],
  shopee_ads: [],
  shopee_daily: ["date", "shop_id"],
  return_log: ["token"],
  return_edit_log: [],
  sku_info_log: [],
  tasks: ["task_id"],
  tasks_log: [],
  rd_items: [],
};

// ─── sheet → table config ────────────────────────────────────
// rename: source column → dest column
// rowTransform: receives coerced row object (by sheet header) → returns DB row
const JOBS = [
  { sheet: "00_Config",        table: "config",          rename: { group: "grp" } },
  { sheet: "01_Orders",        table: "orders" },
  { sheet: "02_Items",         table: "items",
    rowTransform: (r) => (r.order_id && r.line_id ? r : null) },
  { sheet: "03_Budget",        table: "budgets" },
  { sheet: "04_Suppliers",     table: "suppliers" },
  { sheet: "05_Users",         table: "users",
    // Many legacy rows still use the old header order (channels was column 5,
    // not 11). Detect by: extra_permissions holding TRUE/FALSE and channels
    // empty → shift columns back.
    rowTransform: (r) => {
      const ep = r.extra_permissions;
      if ((ep === true || ep === false || ep === "TRUE" || ep === "FALSE") && !r.channels) {
        return {
          ...r,
          channels: r.is_active || null,
          is_active: ep,
          extra_permissions: null,
          created_at: r.note,
          note: null,
        };
      }
      return r;
    } },
  { sheet: "07_Targets",       table: "targets" },
  { sheet: "08_Pages",         table: "pages" },
  { sheet: "09_Assignments",   table: "assignments" },
  { sheet: "10_Sales_Sync",    table: "sales_sync" },
  { sheet: "11_Inventory",     table: "inventory",
    // Sheet header has last_sync before sold_30d but data was written under
    // the gs.txt order (sold_30d first). Swap to align values with columns.
    rowTransform: (r) => ({
      ...r,
      last_sync: r.sold_30d,
      sold_30d: typeof r.last_sync === "string" && /\D/.test(r.last_sync)
        ? 0
        : r.last_sync,
    }) },
  { sheet: "12_Products",      table: "products" },
  { sheet: "12_Deployments",   table: "deployments" },
  { sheet: "13_AdsCache",      table: "ads_cache" },
  { sheet: "14_InsightsCache", table: "insights_cache" },
  { sheet: "15_TikTokAds",     table: "tiktok_ads" },
  { sheet: "16_TikTokChannel", table: "tiktok_channel" },
  { sheet: "19_Customers",     table: "customers" },
  { sheet: "20_ShopeeAds",     table: "shopee_ads" },
  { sheet: "21_ShopeeDaily",   table: "shopee_daily" },
  { sheet: "22_ReturnLog",     table: "return_log" },
  { sheet: "22_ReturnEditLog", table: "return_edit_log" },
  { sheet: "24_SkuInfoLog",    table: "sku_info_log" },
  { sheet: "Tasks",            table: "tasks",
    rename: {
      id: "task_id", desc: "description",
      assigneeEmail: "assignee_email", assigneeName: "assignee_name",
      createdAt: "created_at", updatedAt: "updated_at",
      createdBy: "created_by",
    } },
  { sheet: "TasksLog",         table: "tasks_log" },
  // 18_RD: special — 70 sheet columns; pack unknown into `data` jsonb.
  { sheet: "18_RD",            table: "rd_items",
    rowTransform: (r) => {
      const known = {
        id: r.id || undefined,
        name: r.name || null,
        source_url: r.links || null,
        stage: r.stage || null,
        note: r.note || null,
        created_by: r.proposer_email || null,
        created_at: r.created_at || null,
        updated_at: r.updated_at || null,
      };
      const data = { ...r };
      return { ...known, data };
    } },
];

// ─── upsert conflict keys per table ──────────────────────────
const CONFLICT = {
  config: "grp,key",
  orders: "order_id",
  items: "order_id,line_id",
  budgets: "month_key,team",
  suppliers: "supplier_name",
  users: "email",
  targets: "target_id",
  pages: "page_id",
  assignments: "assign_id",
  sales_sync: "channel,source,period_from,period_to",
  inventory: "sku",
  products: "sku",
  deployments: "deploy_id",
  ads_cache: "date,ad_account_id",
  insights_cache: "date,page_id",
  tiktok_ads: "date,advertiser_id",
  tiktok_channel: "date,account_id",
  customers: "customer_id",
  shopee_ads: null,           // synthetic id → insert fresh after truncate
  shopee_daily: "date,shop_id",
  return_log: "token",
  return_edit_log: null,
  sku_info_log: null,
  tasks: "task_id",
  tasks_log: null,
  rd_items: null,
};

// ─── core ────────────────────────────────────────────────────
const BATCH = 500;

function filterColumns(row, cols) {
  const out = {};
  for (const c of cols) if (c in row) out[c] = row[c];
  return out;
}

function renameKeys(row, map) {
  if (!map) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const nk = map[k] || k;
    out[nk] = v;
  }
  return out;
}

async function truncate(table) {
  const { error } = await db.rpc("truncate_table", { tbl: table });
  if (error) console.error(`  ⚠ truncate ${table}:`, error.message);
}

async function runJob(job, opts) {
  const cols = TABLE_COLS[job.table];
  if (!cols) throw new Error("No column list for " + job.table);

  console.log(`\n▶ ${job.sheet} → ${job.table}`);
  const rawRows = await fetchSheetCsv(job.sheet);
  console.log(`  fetched ${rawRows.length} rows from sheet`);

  if (rawRows.length === 0) {
    console.log("  (empty)");
    return { inserted: 0 };
  }

  // Coerce + rename + transform + normalize + filter
  const pkCols = PK_COLS[job.table] || [];
  const seen = new Map(); // conflict-key → last row, for dedupe
  const dedupeKey = CONFLICT[job.table];
  const dedupeFields = dedupeKey ? dedupeKey.split(",") : null;

  let skippedEmpty = 0, skippedDup = 0;
  for (const r of rawRows) {
    let row = coerceRow(r);
    row = renameKeys(row, job.rename);
    if (job.rowTransform) {
      row = job.rowTransform(row);
      if (!row) continue;
    }
    row = normalize(row);
    // Filter to schema columns
    const final = job.table === "rd_items" ? row : filterColumns(row, cols);
    // Skip rows missing required PK
    if (pkCols.some((c) => final[c] == null || final[c] === "")) {
      skippedEmpty++;
      continue;
    }
    // Dedupe within CSV for tables with unique constraints
    if (dedupeFields) {
      const key = dedupeFields.map((f) => final[f]).join("|");
      if (seen.has(key)) skippedDup++;
      seen.set(key, final);
    } else {
      seen.set(Symbol(), final);
    }
  }
  const prepared = Array.from(seen.values());
  if (skippedEmpty) console.log(`  skipped ${skippedEmpty} rows (null PK)`);
  if (skippedDup) console.log(`  deduped ${skippedDup} rows (CSV duplicates)`);
  console.log(`  prepared ${prepared.length} rows`);

  if (opts.reset) {
    console.log("  truncating existing rows...");
    await truncate(job.table);
  }

  let inserted = 0;
  for (let i = 0; i < prepared.length; i += BATCH) {
    const chunk = prepared.slice(i, i + BATCH);
    const conflict = CONFLICT[job.table];
    const q = conflict
      ? db.from(job.table).upsert(chunk, { onConflict: conflict, ignoreDuplicates: false })
      : db.from(job.table).insert(chunk);
    const { error } = await q;
    if (error) {
      console.error(
        `  ✖ batch ${i}-${i + chunk.length} failed: ${error.message}`,
      );
      // Log one sample row for debugging
      console.error("    sample:", JSON.stringify(chunk[0]).substring(0, 300));
      throw error;
    }
    inserted += chunk.length;
    if (prepared.length > BATCH)
      process.stdout.write(`\r  inserted ${inserted}/${prepared.length}`);
  }
  if (prepared.length > BATCH) process.stdout.write("\n");
  console.log(`  ✓ ${inserted} rows`);
  return { inserted };
}

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");
  const only = args.filter((a) => !a.startsWith("--"))[0];

  const jobs = only ? JOBS.filter((j) => j.table === only || j.sheet === only) : JOBS;
  if (!jobs.length) {
    console.error("No matching job for:", only);
    process.exit(1);
  }

  const t0 = Date.now();
  const summary = [];
  for (const job of jobs) {
    try {
      const { inserted } = await runJob(job, { reset });
      summary.push({ table: job.table, inserted, status: "OK" });
    } catch (e) {
      summary.push({ table: job.table, inserted: 0, status: "FAIL: " + e.message });
    }
  }
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("\n─── SUMMARY ────────────────────────────────");
  for (const s of summary)
    console.log(
      `  ${s.table.padEnd(22)} ${String(s.inserted).padStart(8)}  ${s.status}`,
    );
  console.log(`─── Done in ${sec}s ─────────────────────────`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
