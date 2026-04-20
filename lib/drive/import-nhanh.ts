import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN } from "@/lib/helpers";

const FOLDER_ID = "1EvUeg4CHo6mRN4tTBIdmMAmrBQTp9YXu";

type DriveFile = { id: string; name: string; date: string };

/** List files in NhanhReport Drive folder (public, via embedded view for full listing) */
export async function listDriveFiles(): Promise<DriveFile[]> {
  const url = `https://drive.google.com/embeddedfolderview?id=${FOLDER_ID}&hl=en`;
  const res = await fetch(url);
  const html = await res.text();

  const files: DriveFile[] = [];
  // Each entry: <div class="flip-entry" id="entry-{ID}" ...>...<div class="flip-entry-title">{DATE}</div>
  const regex = /id="entry-([a-zA-Z0-9_-]{20,})"[^]*?flip-entry-title">(\d{2}\.\d{2}\.\d{4})</g;
  // Use split approach to avoid cross-entry matching
  const entries = html.split('class="flip-entry"');
  for (const entry of entries) {
    const idMatch = entry.match(/id="entry-([a-zA-Z0-9_-]{20,})"/);
    const dateMatch = entry.match(/flip-entry-title">(\d{2}\.\d{2}\.\d{4})/);
    if (idMatch && dateMatch) {
      const [dd, mm, yyyy] = dateMatch[1].split(".");
      files.push({ id: idMatch[1], name: dateMatch[1], date: `${yyyy}-${mm}-${dd}` });
    }
  }

  return files.sort((a, b) => b.date.localeCompare(a.date));
}

/** Download a Google Sheet as CSV */
async function downloadSheetCsv(fileId: string): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.text();
}

/** Parse Vietnamese number: "21.083.388" or "21083388" → 21083388 */
function parseVNNum(s: string | undefined): number {
  if (!s) return 0;
  // Remove dots used as thousand separators, replace comma decimal
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  return Number(cleaned) || 0;
}

/** Parse NhanhReport CSV line (handles quoted fields with commas) */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

type ImportResult = { date: string; rows: number; channels: string[] };

/** Import a single NhanhReport CSV into sales_sync */
export async function importDriveFile(fileId: string, date: string): Promise<ImportResult> {
  const csv = await downloadSheetCsv(fileId);
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new Error("File rỗng");

  // Parse header
  const headers = parseCsvLine(lines[0]);
  const colIdx = {
    channel: headers.indexOf("Kênh bán"),
    source: headers.indexOf("Nguồn"),
    orderTotal: headers.indexOf("Tổng đơn"),
    revTotal: headers.indexOf("Tổng doanh thu"),
    orderCancel: headers.indexOf("Đơn hoàn hủy"),
    revCancel: headers.indexOf("Doanh thu đơn hoàn hủy"),
    orderSuccess: headers.indexOf("Đơn thành công"),
    revSuccess: headers.indexOf("Doanh thu đơn thành công"),
    orderNet: headers.indexOf("Đơn tạo - Hoàn hủy"),
    revNet: headers.indexOf("Doanh thu đơn tạo - hoàn hủy"),
  };

  if (colIdx.channel < 0 || colIdx.source < 0) {
    throw new Error("Không tìm thấy cột 'Kênh bán' hoặc 'Nguồn'");
  }

  const db = supabaseAdmin();
  type Row = {
    _key: string; channel: string; source: string;
    period_from: string; period_to: string;
    order_total: number; order_cancel: number; order_net: number;
    revenue_total: number; revenue_cancel: number; revenue_net: number;
    order_success: number; revenue_success: number; synced_at: string;
  };
  const rows: Row[] = [];
  const channels = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const rawChannel = cols[colIdx.channel];
    const source = cols[colIdx.source];
    if (!rawChannel || !source) continue;

    // Skip subtotal rows: leading space " Facebook", or source equals channel name
    const channel = rawChannel.trim();
    if (rawChannel.startsWith(" ")) continue;
    if (source === channel) continue;

    // Normalize source names for consistency
    const SOURCE_MAP: Record<string, string> = {
      "VELASBOOST": "Velasboost",
      "velasboost": "Velasboost",
    };
    const normalizedSource = SOURCE_MAP[source] || source;

    channels.add(channel);

    // Aggregate rows with same channel+source (e.g. 2 "Lỗ Vũ" pages)
    const key = `${channel}|${normalizedSource}`;
    const existing = rows.find((r) => r._key === key);
    // Use "Đơn thành công" / "Doanh thu đơn thành công" as primary values
    // because CSV files contain mixed statuses, not just success
    const ordSuccess = parseVNNum(cols[colIdx.orderSuccess]);
    const revSuccess = parseVNNum(cols[colIdx.revSuccess]);
    const ordTotal = parseVNNum(cols[colIdx.orderTotal]);
    const revTotal = parseVNNum(cols[colIdx.revTotal]);
    const ordCancel = parseVNNum(cols[colIdx.orderCancel]);
    const revCancel = parseVNNum(cols[colIdx.revCancel]);

    if (existing) {
      existing.order_total += ordTotal;
      existing.order_cancel += ordCancel;
      existing.order_net += ordSuccess;
      existing.revenue_total += revTotal;
      existing.revenue_cancel += revCancel;
      existing.revenue_net += revSuccess;
      existing.order_success += ordSuccess;
      existing.revenue_success += revSuccess;
    } else {
      rows.push({
        _key: key,
        channel,
        source: normalizedSource,
        period_from: date,
        period_to: date,
        order_total: ordTotal,
        order_cancel: ordCancel,
        order_net: ordSuccess,
        revenue_total: revTotal,
        revenue_cancel: revCancel,
        revenue_net: revSuccess,
        order_success: ordSuccess,
        revenue_success: revSuccess,
        synced_at: nowVN(),
      });
    }
  }

  if (rows.length === 0) throw new Error("Không có dữ liệu");

  // Remove internal _key before writing
  const cleanRows = rows.map(({ _key, ...rest }) => rest);

  // Delete old data for this date then insert fresh
  await db.from("sales_sync").delete().eq("period_from", date).eq("period_to", date);

  for (let i = 0; i < cleanRows.length; i += 200) {
    const chunk = cleanRows.slice(i, i + 200);
    const { error } = await db
      .from("sales_sync")
      .upsert(chunk, { onConflict: "channel,source,period_from,period_to" });
    if (error) throw error;
  }

  return { date, rows: rows.length, channels: [...channels] };
}

/** Scan Drive folder and import all files within date range */
export async function scanAndImport(opts: {
  from?: string;
  to?: string;
} = {}): Promise<{ imported: ImportResult[]; skipped: number; errors: string[] }> {
  const files = await listDriveFiles();
  const from = opts.from || "2000-01-01";
  const to = opts.to || "9999-12-31";

  const imported: ImportResult[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (const f of files) {
    if (f.date < from || f.date > to) { skipped++; continue; }
    try {
      const result = await importDriveFile(f.id, f.date);
      imported.push(result);
    } catch (e) {
      errors.push(`${f.name}: ${(e as Error).message}`);
    }
    // Rate limit
    await new Promise((r) => setTimeout(r, 300));
  }

  return { imported, skipped, errors };
}
