import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN } from "@/lib/helpers";
import { toNum } from "@/lib/format";

// Port of apiShopeeAdsUploadCSV (gs.txt:271).
// Parses the Shopee Ads Manager monthly CSV export.

export type ShopeeUploadResult = {
  ok: true;
  rows: number;
  month: string;
  shop: string;
  period?: string;
} | {
  ok: false;
  error: string;
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) { cells.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export async function uploadShopeeCsv(csvText: string, shopOverride?: string): Promise<ShopeeUploadResult> {
  try {
    const rawLines = csvText.split("\n").map((l) => l.trim().replace(/^\uFEFF/, ""));

    // Extract metadata from top rows
    let shopName = shopOverride ? shopOverride.trim() : "";
    let uploadMonth = nowVN().substring(0, 7);
    let periodFrom = "";
    let periodTo = "";
    let periodStr = "";
    for (let i = 0; i < Math.min(rawLines.length, 10); i++) {
      const ml = rawLines[i];
      if (!shopOverride && ml.toLowerCase().includes("tên gian hàng")) {
        const sp = ml.split(",");
        if (sp[1] && !shopName) shopName = sp[1].trim().replace(/^"|"$/g, "");
      }
      if (ml.toLowerCase().includes("khoảng thời gian")) {
        const parts = ml.split(",");
        if (parts[1]) {
          const dates = parts[1].trim().replace(/^"|"$/g, "").split(" - ");
          const endDate = dates[dates.length - 1].trim();
          const startDate = dates[0] ? dates[0].trim() : "";
          const dp = endDate.split("/");
          if (dp.length === 3) {
            uploadMonth = `${dp[2]}-${dp[1]}`;
            periodTo = `${dp[2]}-${dp[1]}-${dp[0]}`;
          }
          if (startDate) {
            const sp2 = startDate.split("/");
            if (sp2.length === 3) periodFrom = `${sp2[2]}-${sp2[1]}-${sp2[0]}`;
          }
        }
        periodStr = parts[1] ? parts[1].trim() : "";
      }
    }

    // Find header row
    let headerIdx = -1;
    let header: string[] = [];
    for (let i = 0; i < Math.min(rawLines.length, 20); i++) {
      if (!rawLines[i]) continue;
      const cells = rawLines[i].split(",").map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());
      const hasSpend = cells.some((c) => c === "chi phí" || c.startsWith("chi phí"));
      const hasRevenue = cells.some((c) => c === "doanh số" || c.startsWith("doanh số"));
      const hasClicks = cells.some((c) => c.includes("lượt click") || c === "clicks");
      if ((hasSpend && hasRevenue) || (hasSpend && hasClicks) || cells.length >= 10) {
        header = cells;
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) {
      return { ok: false, error: "Không tìm thấy header. Dùng file Báo cáo Dịch vụ Hiển thị từ Shopee." };
    }

    const col = (names: string[]): number => {
      for (const n of names) {
        const idx = header.indexOf(n);
        if (idx >= 0) return idx;
      }
      for (const n of names) {
        const idx = header.findIndex((h) => h.startsWith(n));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const iName = col(["tên dịch vụ hiển thị", "campaign name", "tên chiến dịch"]);
    const iType = col(["loại dịch vụ hiển thị", "ad type", "loại quảng cáo"]);
    const iImpr = col(["số lượt xem", "impressions", "hiển thị"]);
    const iClicks = col(["số lượt click", "clicks", "lượt click"]);
    const iOrders = col(["lượt chuyển đổi trực tiếp", "lượt chuyển đổi", "orders", "đơn hàng"]);
    const iRevenue = col(["doanh số", "revenue", "doanh thu"]);
    const iSpend = col(["chi phí", "spend", "budget spent"]);
    const iRoas = col(["roas"]);
    const iStart = col(["ngày bắt đầu", "start date"]);

    if (iSpend < 0) {
      return { ok: false, error: "Không tìm thấy cột Chi phí. Header: " + header.slice(0, 10).join(", ") };
    }

    const now = nowVN();
    const rows: Array<Record<string, unknown>> = [];
    for (const line of rawLines.slice(headerIdx + 1)) {
      if (!line) continue;
      const cells = parseCsvLine(line);
      if (cells.length < 3) continue;
      const spend = toNum((cells[iSpend] || "0").replace(/[,\s]/g, ""));
      if (!spend && spend !== 0) continue;

      const dateRaw = iStart >= 0 ? cells[iStart] || "" : "";
      let date = uploadMonth + "-01";
      const m = dateRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) date = `${m[3]}-${m[2]}-${m[1]}`;

      rows.push({
        date,
        campaign_name: iName >= 0 ? String(cells[iName] || "").substring(0, 100) : null,
        ad_type: iType >= 0 ? cells[iType] || null : null,
        spend,
        impressions: iImpr >= 0 ? toNum((cells[iImpr] || "0").replace(/[,\s]/g, "")) : 0,
        clicks: iClicks >= 0 ? toNum((cells[iClicks] || "0").replace(/[,\s]/g, "")) : 0,
        orders: iOrders >= 0 ? toNum((cells[iOrders] || "0").replace(/[,\s]/g, "")) : 0,
        revenue: iRevenue >= 0 ? toNum((cells[iRevenue] || "0").replace(/[,\s]/g, "")) : 0,
        roas: iRoas >= 0 ? toNum((cells[iRoas] || "0").replace(/[,\s]/g, "")) : 0,
        synced_at: now,
        shop: shopName,
        period_from: periodFrom || null,
        period_to: periodTo || null,
      });
    }

    if (!rows.length) return { ok: false, error: "Không parse được dòng nào." };

    const db = supabaseAdmin();
    // Replace (shop, date) — delete for this specific date range then insert
    if (periodFrom && periodTo) {
      await db.from("shopee_ads").delete()
        .eq("shop", shopName)
        .gte("date", periodFrom)
        .lte("date", periodTo);
    } else {
      await db.from("shopee_ads").delete()
        .eq("shop", shopName)
        .gte("date", `${uploadMonth}-01`)
        .lte("date", `${uploadMonth}-31`);
    }

    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { error } = await db.from("shopee_ads").insert(chunk);
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true, rows: rows.length, month: uploadMonth, shop: shopName, period: periodStr };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
