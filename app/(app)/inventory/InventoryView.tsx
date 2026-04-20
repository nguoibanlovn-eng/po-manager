"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { InventoryRow, InventoryStats } from "@/lib/db/inventory";
import SyncButton from "../components/SyncButton";
import Collapsible from "../components/Collapsible";

type SalesItem = { sku: string; product_name: string; channels: string; qty: number; orders: number; revenue: number };
type SalesSummary = { totalSkus: number; totalOrders: number; totalQty: number; totalRevenue: number };

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function daysAgo(d: number): string { const dt = new Date(); dt.setDate(dt.getDate() + d); return fmtDate(dt); }
function monthRange(offset: number) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth() + offset;
  const first = new Date(y, m, 1); const last = offset === 0 ? now : new Date(y, m + 1, 0);
  return { from: fmtDate(first), to: fmtDate(last) };
}

const CAT_GROUPS = [
  { k: "no_sale", label: "Không bán", sub: "0 đơn / 30 ngày", bg: "#FCEBEB", color: "#A32D2D" },
  { k: "slow", label: "Bán chậm", sub: "< 10% tồn/tháng", bg: "#FAEEDA", color: "#854F0B" },
  { k: "normal", label: "Bình thường", sub: "10–30%", bg: "#E6F1FB", color: "#185FA5" },
  { k: "good", label: "Bán tốt", sub: "> 30% hoặc hết hàng", bg: "#EAF3DE", color: "#3B6D11" },
  { k: "no_data", label: "Chưa có data", sub: "Chưa sync bán", bg: "#F5F5F4", color: "#57534E" },
];

/** Sync sales button — V3+V1 per day, chunks 3 ngày */
function SyncSalesButton({ onDone, from, to }: { onDone: () => void; from: string; to: string }) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState("");
  const [logs, setLogs] = useState<string[]>([]);

  async function doSync(clearFirst: boolean) {
    setSyncing(true); setProgress(clearFirst ? "Xoá data cũ..." : "Bắt đầu...");
    setLogs([]);
    try {
      // Chunk 3 ngày (V3+V1 per day ≈ 40s/day → 3 days ≈ 120s < 300s)
      const chunks: Array<{ from: string; to: string }> = [];
      let cursor = new Date(from + "T00:00:00Z");
      const end = new Date(to + "T00:00:00Z");
      while (cursor <= end) {
        const chunkEnd = new Date(cursor);
        chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 2);
        const cTo = chunkEnd > end ? to : fmtDate(chunkEnd);
        chunks.push({ from: fmtDate(cursor), to: cTo });
        cursor = new Date(chunkEnd);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      let totalRows = 0, totalOrders = 0;
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        setProgress(`Chunk ${i + 1}/${chunks.length}: ${c.from} → ${c.to}...`);
        const payload: Record<string, unknown> = { ...c };
        if (clearFirst && i === 0) payload.clear = true;
        const res = await fetch("/api/nhanh/sync-product-sales", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok && res.status >= 500) {
          setProgress(`Lỗi server (${res.status}) — thử lại sau`);
          break;
        }
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch { setProgress(`Lỗi: response không hợp lệ`); break; }
        if (!json.ok) { setProgress(`Lỗi: ${json.error}`); break; }
        totalRows += json.totalRows || 0;
        totalOrders += json.totalOrders || 0;
        // Append logs from API
        if (json.logs) setLogs((prev) => [...prev, ...json.logs]);
        setProgress(`Chunk ${i + 1}/${chunks.length} ✓ ${totalOrders.toLocaleString()} đơn → ${totalRows.toLocaleString()} dòng`);
      }
      setProgress(`✓ Xong: ${totalOrders.toLocaleString()} đơn → ${totalRows.toLocaleString()} dòng`);
      onDone();
    } catch (e) {
      setProgress(`Lỗi: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => doSync(false)} disabled={syncing}
          style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, border: "none", cursor: syncing ? "wait" : "pointer", background: "#EAF3DE", color: "#3B6D11" }}>
          {syncing ? "Đang sync..." : "⟳ Đồng bộ Nhanh"}
        </button>
        <button onClick={() => { if (confirm("Xoá toàn bộ data bán cũ rồi sync lại?")) doSync(true); }} disabled={syncing}
          style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, border: "1px solid #FECACA", cursor: syncing ? "wait" : "pointer", background: "#FEF2F2", color: "#DC2626" }}>
          Xoá & Sync lại
        </button>
        {progress && <span style={{ fontSize: 10, color: progress.startsWith("✓") ? "#16A34A" : progress.startsWith("Lỗi") ? "#DC2626" : "#6B7280" }}>{progress}</span>}
      </div>
      {logs.length > 0 && (
        <div style={{ marginTop: 6, maxHeight: 150, overflow: "auto", fontSize: 9, fontFamily: "monospace", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, padding: "4px 8px" }}>
          {logs.map((l, i) => <div key={i} style={{ color: l.startsWith("ERROR") ? "#DC2626" : l.startsWith("  →") ? "#16A34A" : "#374151" }}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

export default function InventoryView({
  rows, total, q, filter, sort, category, stats, page, totalPages,
}: {
  rows: InventoryRow[]; total: number; q: string; filter: string; sort: string; category: string; stats: InventoryStats; page: number; totalPages: number;
}) {
  const router = useRouter();

  // Build URL with filter params
  function buildUrl(params: Record<string, string>) {
    const p = new URLSearchParams({ q, filter, sort, category, page: "1" });
    for (const [k, v] of Object.entries(params)) p.set(k, v);
    if (!p.get("q")) p.delete("q");
    if (p.get("filter") === "all") p.delete("filter");
    if (p.get("sort") === "stock_desc") p.delete("sort");
    if (!p.get("category")) p.delete("category");
    if (p.get("page") === "1") p.delete("page");
    const qs = p.toString();
    return `/inventory${qs ? `?${qs}` : ""}`;
  }

  // ─── Bảng 2 state ───
  const [salesItems, setSalesItems] = useState<SalesItem[]>([]);
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [salesChannels, setSalesChannels] = useState<string[]>([]);
  const [salesLoaded, setSalesLoaded] = useState(false);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesFrom, setSalesFrom] = useState(daysAgo(-30));
  const [salesTo, setSalesTo] = useState(daysAgo(0));
  const [salesPreset, setSalesPreset] = useState("30d");
  const [salesChannel, setSalesChannel] = useState("");
  const [salesSearch, setSalesSearch] = useState("");
  const [salesSort, setSalesSort] = useState("revenue_desc");
  const [salesFilter, setSalesFilter] = useState("all");
  const [salesPage, setSalesPage] = useState(1);

  // ─── Bảng 3 state ───
  const [analysisFilter, setAnalysisFilter] = useState("all");
  const [analysisSort, setAnalysisSort] = useState("value_desc");
  const [analysisSearch, setAnalysisSearch] = useState("");
  const [analysisPage, setAnalysisPage] = useState(1);

  // ─── Bảng 1 totals ───
  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.category) s.add(r.category);
    return Array.from(s).sort();
  }, [rows]);

  const invTotals = useMemo(() => {
    let totalStock = 0, totalValue = 0;
    for (const r of rows) {
      const stock = toNum(r.available_qty);
      totalStock += stock;
      totalValue += stock * toNum(r.cost_price); // Giá trị tồn theo giá vốn
    }
    return { totalStock, totalValue };
  }, [rows]);

  // ─── Sync status ───
  const [syncStatus, setSyncStatus] = useState<{ lastSync: string | null; today: string; todayRows: number; yesterdayRows: number } | null>(null);
  useEffect(() => {
    fetch("/api/inventory/sync-status").then((r) => r.json()).then((j) => { if (j.ok) setSyncStatus(j); }).catch(() => {});
  }, []);

  // ─── Bảng 2: Load sales ───
  const [salesError, setSalesError] = useState("");
  const loadSales = useCallback(async (from?: string, to?: string) => {
    setSalesLoading(true); setSalesError("");
    try {
      const f = from || salesFrom; const t = to || salesTo;
      const params = new URLSearchParams({ from: f, to: t, sort: salesSort });
      if (salesChannel) params.set("channel", salesChannel);
      if (salesSearch) params.set("q", salesSearch);
      const res = await fetch(`/api/inventory/product-sales?${params}`);
      const json = await res.json();
      if (json.ok) { setSalesItems(json.items || []); setSalesSummary(json.summary || null); setSalesChannels(json.channels || []); setSalesLoaded(true); setSalesPage(1); }
      else { setSalesError(`API: ${json.error || res.status}`); }
    } catch (e) { setSalesError(`Fetch: ${(e as Error).message}`); } finally { setSalesLoading(false); }
  }, [salesFrom, salesTo, salesChannel, salesSearch, salesSort]);

  // Auto-load sales khi mở trang (30 ngày mặc định)
  useEffect(() => { loadSales(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setDatePreset(key: string) {
    let f: string, t: string;
    if (key === "7d") { f = daysAgo(-7); t = daysAgo(0); }
    else if (key === "30d") { f = daysAgo(-30); t = daysAgo(0); }
    else if (key === "month") { const r = monthRange(0); f = r.from; t = r.to; }
    else if (key === "prev") { const r = monthRange(-1); f = r.from; t = r.to; }
    else { f = "2026-01-01"; t = daysAgo(0); }
    setSalesFrom(f); setSalesTo(t); setSalesPreset(key);
    loadSales(f, t);
  }

  // Filtered sales
  const filteredSales = useMemo(() => {
    let list = salesItems;
    if (salesFilter === "has_sale") list = list.filter((s) => s.qty > 0);
    else if (salesFilter === "no_sale") list = list.filter((s) => s.qty === 0);
    return list;
  }, [salesItems, salesFilter]);

  const SALES_PG = 50;
  const salesTotalPages = Math.ceil(filteredSales.length / SALES_PG);
  const salesPaginated = filteredSales.slice((salesPage - 1) * SALES_PG, salesPage * SALES_PG);

  // ─── Bảng 3: Analysis (load toàn bộ products từ API) ───
  type AnalysisItem = { sku: string; product_name: string; stock: number; sold: number; rate: number; category: string; stockValue: number; cost_price: number };
  const [analysisItems, setAnalysisItems] = useState<AnalysisItem[]>([]);
  const [analysisCounts, setAnalysisCounts] = useState<Record<string, number>>({ no_sale: 0, slow: 0, normal: 0, good: 0, no_data: 0 });
  const [analysisTotal, setAnalysisTotal] = useState(0);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const [analysisError, setAnalysisError] = useState("");
  const loadAnalysis = useCallback(async () => {
    setAnalysisLoading(true); setAnalysisError("");
    try {
      const params = new URLSearchParams({ from: salesFrom, to: salesTo });
      const res = await fetch(`/api/inventory/stock-analysis?${params}`);
      const json = await res.json();
      if (json.ok) {
        setAnalysisItems(json.items || []);
        setAnalysisCounts(json.counts || {});
        setAnalysisTotal(json.total || 0);
      } else { setAnalysisError(`API: ${json.error || res.status}`); }
    } catch (e) { setAnalysisError(`Fetch: ${(e as Error).message}`); } finally { setAnalysisLoading(false); }
  }, [salesFrom, salesTo]);

  // Auto-load analysis khi mount + khi sales data loaded
  const [analysisAutoLoaded, setAnalysisAutoLoaded] = useState(false);
  useEffect(() => {
    if (!analysisAutoLoaded) { loadAnalysis(); setAnalysisAutoLoaded(true); }
  }, [analysisAutoLoaded, loadAnalysis]);
  useEffect(() => { if (salesLoaded) loadAnalysis(); }, [salesLoaded, loadAnalysis]);

  const filteredAnalysis = useMemo(() => {
    let list = analysisFilter === "all" ? analysisItems : analysisItems.filter((a) => a.category === analysisFilter);
    if (analysisSort === "value_desc") list = [...list].sort((a, b) => b.stockValue - a.stockValue);
    else if (analysisSort === "stock_desc") list = [...list].sort((a, b) => b.stock - a.stock);
    else if (analysisSort === "stock_asc") list = [...list].sort((a, b) => a.stock - b.stock);
    else if (analysisSort === "rate_desc") list = [...list].sort((a, b) => b.rate - a.rate);
    else if (analysisSort === "rate_asc") list = [...list].filter((a) => a.sold > 0).sort((a, b) => a.rate - b.rate);
    else if (analysisSort === "no_sold") list = [...list].filter((a) => a.sold === 0 && a.stock > 0).sort((a, b) => b.stock - a.stock);
    else if (analysisSort === "sold_desc") list = [...list].sort((a, b) => b.sold - a.sold);
    else if (analysisSort === "sold_asc") list = [...list].sort((a, b) => a.sold - b.sold);
    return list;
  }, [analysisItems, analysisFilter, analysisSort]);

  const searchedAnalysis = useMemo(() => {
    if (!analysisSearch) return filteredAnalysis;
    const q = analysisSearch.toLowerCase();
    return filteredAnalysis.filter((a) => a.sku.toLowerCase().includes(q) || (a.product_name || "").toLowerCase().includes(q));
  }, [filteredAnalysis, analysisSearch]);

  const ANALYSIS_PG = 50;
  const analysisTotalPages = Math.ceil(searchedAnalysis.length / ANALYSIS_PG);
  const analysisPaginated = searchedAnalysis.slice((analysisPage - 1) * ANALYSIS_PG, analysisPage * ANALYSIS_PG);

  const analysisGroupTotals = useMemo(() => {
    const t = { count: 0, stock: 0, sold: 0, value: 0 };
    for (const a of searchedAnalysis) { t.count++; t.stock += a.stock; t.sold += a.sold; t.value += a.stockValue; }
    return t;
  }, [searchedAnalysis]);

  return (
    <section className="section">
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      {/* ═══ HEADER ═══ */}
      <div className="page-hdr">
        <div>
          <div className="page-title">Quản lý tồn kho</div>
          <div className="page-sub">Dữ liệu từ Nhanh.vn</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Cài cảnh báo</button>
          <SyncButton url="/api/nhanh/sync-products" label="↻ Đồng bộ SP" onDone={() => router.refresh()} />
          <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={() => router.refresh()}>↻ Làm mới</button>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════
         DANH SÁCH SẢN PHẨM
         ═════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: 14 }}>
        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 10 }}>
          {[
            { label: "Tổng sản phẩm", value: stats.totalProducts.toLocaleString("vi-VN"), color: "#6366F1", bg: "#EEF2FF" },
            { label: "Còn hàng", value: stats.inStock.toLocaleString("vi-VN"), color: "#16A34A", bg: "#F0FDF4" },
            { label: "Tồn kho", value: stats.totalStock.toLocaleString("vi-VN"), color: "#D97706", bg: "#FFFBEB" },
            { label: "Giá trị tồn", value: formatVNDCompact(stats.totalValue), color: "#DC2626", bg: "#FEF2F2" },
          ].map((k) => (
            <div key={k.label} className="card" style={{ padding: "10px 14px", background: k.bg, border: "none" }}>
              <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 500 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.color, marginTop: 2 }}>{k.value}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 0 }}>
          {/* Header */}
          <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Danh sách sản phẩm</div>
            <span style={{ fontSize: 10, color: "#6B7280" }}>{total.toLocaleString("vi-VN")} SP</span>
          </div>

          {/* Filter bar */}
          <form action="/inventory" style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, alignItems: "center", background: "var(--bg)", fontSize: 11 }}>
            <input type="text" name="q" defaultValue={q} placeholder="Tìm SKU, tên..."
              style={{ width: 150, fontSize: 11, padding: "4px 8px", border: "1px solid #D1D5DB", borderRadius: 6 }} />
            <select name="filter" defaultValue={filter} style={{ fontSize: 11, padding: "4px 6px", border: "1px solid #D1D5DB", borderRadius: 6 }}
              onChange={(e) => router.push(buildUrl({ filter: e.target.value }))}>
              <option value="all">Tất cả tình trạng</option>
              <option value="in_stock">Còn hàng</option>
              <option value="low_stock">Sắp hết (≤10)</option>
              <option value="out_of_stock">Hết hàng</option>
            </select>
            <select name="sort" defaultValue={sort} style={{ fontSize: 11, padding: "4px 6px", border: "1px solid #D1D5DB", borderRadius: 6 }}
              onChange={(e) => router.push(buildUrl({ sort: e.target.value }))}>
              <option value="stock_desc">Tồn nhiều nhất</option>
              <option value="stock_asc">Tồn ít nhất</option>
              <option value="value_desc">Giá trị tồn cao nhất</option>
              <option value="name_asc">Tên A→Z</option>
            </select>
            <button type="submit" className="btn btn-primary btn-xs">Lọc</button>
            <span style={{ marginLeft: "auto", fontSize: 10, color: "#6B7280" }}>{total.toLocaleString("vi-VN")} SP</span>
          </form>

          {/* Table */}
          <div className="tbl-wrap" style={{ maxHeight: 340, overflowY: "auto" }}>
            <table>
              <thead><tr>
                <th style={{ width: 110 }}>SKU</th>
                <th>Tên sản phẩm</th>
                <th style={{ width: 70 }}>Danh mục</th>
                <th className="text-right" style={{ width: 60 }}>Tồn</th>
                <th className="text-right" style={{ width: 80 }}>Giá vốn</th>
                <th className="text-right" style={{ width: 80 }}>Giá bán</th>
                <th style={{ width: 45 }}>Trạng thái</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const avail = toNum(r.available_qty);
                  return (
                    <tr key={r.sku}>
                      <td style={{ fontFamily: "monospace", fontSize: 10 }}>{r.sku}</td>
                      <td style={{ fontSize: 11, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.product_name || "—"}</td>
                      <td style={{ fontSize: 10, color: "#6B7280" }}>{r.category || "—"}</td>
                      <td className="text-right" style={{ fontWeight: 600 }}>{avail > 0 ? avail.toLocaleString("vi-VN") : <span style={{ color: "#9CA3AF" }}>0</span>}</td>
                      <td className="text-right muted" style={{ fontSize: 11 }}>{toNum(r.cost_price) > 0 ? formatVND(toNum(r.cost_price)) : "—"}</td>
                      <td className="text-right" style={{ fontWeight: 600, fontSize: 11 }}>{toNum(r.sell_price) > 0 ? formatVND(toNum(r.sell_price)) : "—"}</td>
                      <td>
                        {avail <= 0
                          ? <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "#FEE2E2", color: "#DC2626" }}>Hết</span>
                          : avail <= 10
                            ? <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "#FEF3C7", color: "#D97706" }}>Ít</span>
                            : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer + pagination */}
          <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", background: "var(--bg)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, fontWeight: 600, color: "#6B7280" }}>
            <div style={{ display: "flex", gap: 14 }}>
              <span>Tổng {total.toLocaleString("vi-VN")} SP</span>
              <span>Tồn: {invTotals.totalStock.toLocaleString("vi-VN")}</span>
              <span>Giá trị: <span style={{ color: "#16A34A" }}>{formatVNDCompact(invTotals.totalValue)}</span></span>
            </div>
            {totalPages > 1 && (
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ fontSize: 10 }}>Trang {page}/{totalPages}</span>
                {page > 1 && <Link href={buildUrl({ page: String(page - 1) })} className="btn btn-ghost btn-xs" style={{ textDecoration: "none" }}>←</Link>}
                {page < totalPages && <Link href={buildUrl({ page: String(page + 1) })} className="btn btn-ghost btn-xs" style={{ textDecoration: "none" }}>→</Link>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════
         CARD 2 — DỮ LIỆU BÁN HÀNG
         ═════════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 14, padding: 0 }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Bảng 1 — Dữ liệu bán hàng</div>
            <div style={{ fontSize: 10, color: "#6B7280" }}>product_sales</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {syncStatus && (
              <div style={{
                fontSize: 10, padding: "3px 10px", borderRadius: 4, fontWeight: 600,
                background: syncStatus.todayRows > 0 ? "#F0FDF4" : syncStatus.yesterdayRows > 0 ? "#FFFBEB" : "#FEF2F2",
                color: syncStatus.todayRows > 0 ? "#16A34A" : syncStatus.yesterdayRows > 0 ? "#D97706" : "#DC2626",
              }}>
                {syncStatus.todayRows > 0
                  ? `✓ Hôm nay: ${syncStatus.todayRows} dòng`
                  : syncStatus.yesterdayRows > 0
                    ? `⚠ Hôm qua: ${syncStatus.yesterdayRows} dòng · Hôm nay chưa sync`
                    : `✕ Chưa có data gần đây`}
                {syncStatus.lastSync && <span style={{ opacity: 0.7 }}> · Sync lần cuối: {syncStatus.lastSync.substring(0, 16)}</span>}
              </div>
            )}
            <SyncSalesButton onDone={() => { loadSales(); fetch("/api/inventory/sync-status").then(r => r.json()).then(j => { if (j.ok) setSyncStatus(j); }); }} from={salesFrom} to={salesTo} />
          </div>
        </div>

        {/* Date range */}
        <div style={{ padding: "8px 14px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 6, alignItems: "center", background: "var(--bg)", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "#6B7280" }}>Thời gian:</span>
          {[{ k: "7d", l: "7 ngày" }, { k: "30d", l: "30 ngày" }, { k: "month", l: "Tháng này" }, { k: "prev", l: "Tháng trước" }, { k: "all", l: "Tất cả" }].map((r) => (
            <button key={r.k} onClick={() => setDatePreset(r.k)} style={{
              padding: "3px 10px", borderRadius: 12, fontSize: 10, fontWeight: 600, cursor: "pointer", border: "none",
              background: salesPreset === r.k ? "#3B82F6" : "#E5E7EB", color: salesPreset === r.k ? "#fff" : "#374151",
            }}>{r.l}</button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
            <input type="date" value={salesFrom} onChange={(e) => setSalesFrom(e.target.value)} style={{ fontSize: 10, width: 110 }} />
            <span style={{ fontSize: 10, color: "#6B7280" }}>→</span>
            <input type="date" value={salesTo} onChange={(e) => setSalesTo(e.target.value)} style={{ fontSize: 10, width: 110 }} />
            <button className="btn btn-primary btn-xs" style={{ fontSize: 10 }} onClick={() => { setSalesPreset(""); loadSales(); }}>✓ Áp dụng</button>
            {salesLoaded && <span style={{ fontSize: 9, color: "#6B7280" }}>{salesFrom} → {salesTo}</span>}
          </div>
        </div>

        {/* Loading indicator */}
        {salesLoading && (
          <div style={{ padding: "12px 14px", textAlign: "center", color: "#6B7280", fontSize: 12, borderBottom: "1px solid var(--border)", background: "#F9FAFB" }}>
            <span style={{ display: "inline-block", animation: "spin 1s linear infinite", marginRight: 6 }}>⟳</span>
            Đang tải dữ liệu bán hàng...
          </div>
        )}

        {/* KPI cards */}
        {salesSummary && !salesLoading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--border)" }}>
            {[
              { label: "Tổng SKU bán", value: salesSummary.totalSkus.toLocaleString("vi-VN"), color: "#3B82F6" },
              { label: "Tổng đơn", value: salesSummary.totalOrders.toLocaleString("vi-VN"), color: "#D97706" },
              { label: "Tổng sản lượng", value: salesSummary.totalQty.toLocaleString("vi-VN"), color: "#7C3AED" },
              { label: "Tổng doanh thu", value: formatVNDCompact(salesSummary.totalRevenue), color: "#16A34A" },
            ].map((k) => (
              <div key={k.label} style={{ padding: "10px 14px", borderRight: "1px solid #F3F4F6" }}>
                <div style={{ fontSize: 10, color: "#6B7280" }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar filter */}
        {salesLoaded && (
          <div style={{ padding: "8px 14px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
            <input placeholder="Tìm SKU, tên SP..." value={salesSearch} onChange={(e) => { setSalesSearch(e.target.value); setSalesPage(1); }} style={{ width: 150, fontSize: 11 }} />
            <select value={salesChannel} onChange={(e) => setSalesChannel(e.target.value)} style={{ fontSize: 11 }}>
              <option value="">Tất cả kênh</option>
              {salesChannels.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
            </select>
            <select value={salesSort} onChange={(e) => setSalesSort(e.target.value)} style={{ fontSize: 11 }}>
              <option value="revenue_desc">Bán nhiều nhất</option>
              <option value="revenue_asc">Bán ít nhất</option>
              <option value="qty_desc">SL nhiều nhất</option>
            </select>
            <select value={salesFilter} onChange={(e) => { setSalesFilter(e.target.value); setSalesPage(1); }} style={{ fontSize: 11 }}>
              <option value="all">Tất cả SP</option>
              <option value="has_sale">Có bán</option>
              <option value="no_sale">Không bán</option>
            </select>
            <span style={{ marginLeft: "auto", fontSize: 10, color: "#6B7280" }}>{filteredSales.length} kết quả</span>
          </div>
        )}

        {/* Table */}
        {salesLoaded ? (
          <div className="tbl-wrap" style={{ maxHeight: 360, overflowY: "auto", transition: "max-height 0.3s" }}>
            <table>
              <thead><tr>
                <th style={{ width: 110 }}>SKU</th><th>Tên SP</th><th>Kênh</th>
                <th className="text-right" style={{ width: 55 }}>SL</th>
                <th className="text-right" style={{ width: 55 }}>Đơn</th>
                <th className="text-right" style={{ width: 90 }}>Doanh thu</th>
              </tr></thead>
              <tbody>
                {salesPaginated.map((s, i) => (
                  <tr key={`${s.sku}-${i}`}>
                    <td style={{ fontFamily: "monospace", fontSize: 10 }}>{s.sku}</td>
                    <td style={{ fontSize: 11 }}>{s.product_name}</td>
                    <td style={{ fontSize: 10, color: "#6B7280" }}>{s.channels}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{s.qty.toLocaleString("vi-VN")}</td>
                    <td className="text-right">{s.orders.toLocaleString("vi-VN")}</td>
                    <td className="text-right" style={{ color: "#16A34A", fontWeight: 700, fontSize: 11 }}>{formatVND(s.revenue)}</td>
                  </tr>
                ))}
                {filteredSales.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>Không có data.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="muted" style={{ padding: 28, textAlign: "center", fontSize: 12 }}>
            {salesLoading ? "Đang tải..." : salesError ? <span style={{ color: "#DC2626" }}>Lỗi: {salesError}</span> : "Bấm ⟳ Đồng bộ Nhanh hoặc chọn khoảng ngày → ✓ Áp dụng"}
          </div>
        )}

        {/* Pagination */}
        {salesLoaded && salesTotalPages > 1 && (
          <div style={{ padding: "6px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", background: "var(--bg)", fontSize: 10 }}>
            <span className="muted">Trang {salesPage}/{salesTotalPages} · {filteredSales.length} SKU</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button className="btn btn-ghost btn-xs" disabled={salesPage <= 1} onClick={() => setSalesPage(salesPage - 1)}>←</button>
              <button className="btn btn-ghost btn-xs" disabled={salesPage >= salesTotalPages} onClick={() => setSalesPage(salesPage + 1)}>→</button>
            </div>
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════
         CARD 3 — PHÂN TÍCH BÁN / TỒN KHO
         ═════════════════════════════════════════════════════════ */}
      <Collapsible title="Bảng 2 — Phân tích bán / tồn kho" defaultOpen={false} badge={<span style={{ fontSize: 10, background: "#E6F1FB", color: "#185FA5", padding: "3px 10px", borderRadius: 4, fontWeight: 600 }}>{salesFrom} → {salesTo}</span>}>
      <div style={{ padding: 0 }}>
        {/* 5 KPI cards — flat style */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0, borderBottom: "1px solid #E5E7EB" }}>
          {CAT_GROUPS.map((c) => {
            const active = analysisFilter === c.k;
            const count = analysisCounts[c.k] || 0;
            return (
              <button key={c.k} onClick={() => { setAnalysisFilter(active ? "all" : c.k); setAnalysisPage(1); }}
                style={{
                  padding: "12px 16px", cursor: "pointer", textAlign: "left",
                  background: c.bg,
                  border: active ? `2px solid ${c.color}` : "1px solid #E5E7EB",
                  borderRadius: 0,
                  transition: "all 0.15s",
                }}>
                <div style={{ fontSize: 10, color: c.color, fontWeight: 600, marginBottom: 2 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color, lineHeight: 1.1 }}>{count}</div>
                <div style={{ fontSize: 9, color: c.color, opacity: 0.6, marginTop: 3 }}>{c.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div style={{ padding: "8px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
          <input placeholder="Tìm SKU, tên SP..." value={analysisSearch} onChange={(e) => { setAnalysisSearch(e.target.value); setAnalysisPage(1); }}
            style={{ width: 150, fontSize: 11, padding: "4px 8px", border: "1px solid #D1D5DB", borderRadius: 6 }} />
          <select value={analysisSort} onChange={(e) => setAnalysisSort(e.target.value)}
            style={{ fontSize: 11, padding: "4px 6px", border: "1px solid #D1D5DB", borderRadius: 6 }}>
            <option value="value_desc">Giá trị tồn cao nhất</option>
            <option value="stock_desc">Tồn nhiều nhất</option>
            <option value="stock_asc">Tồn ít nhất</option>
            <option value="rate_asc">Bán chậm nhất</option>
            <option value="no_sold">Không có lượt bán</option>
            <option value="rate_desc">Bán nhanh nhất</option>
            <option value="sold_desc">Bán nhiều nhất</option>
            <option value="sold_asc">Bán ít nhất</option>
          </select>
          {analysisFilter !== "all" && (
            <button onClick={() => { setAnalysisFilter("all"); setAnalysisPage(1); }}
              style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, border: "none", cursor: "pointer",
                background: CAT_GROUPS.find((c) => c.k === analysisFilter)?.bg, color: CAT_GROUPS.find((c) => c.k === analysisFilter)?.color, fontWeight: 600 }}>
              ✕ {CAT_GROUPS.find((c) => c.k === analysisFilter)?.label}
            </button>
          )}
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#6B7280" }}>{searchedAnalysis.length.toLocaleString("vi-VN")} sản phẩm</span>
        </div>

        {/* Warning box for no_data */}
        {analysisFilter === "no_data" && (
          <div style={{ margin: "8px 16px", padding: "10px 14px", background: "#E6F1FB", borderRadius: 8, fontSize: 11, color: "#185FA5" }}>
            Các SP này chưa có data bán hàng. Bấm <strong>⟳ Đồng bộ Nhanh</strong> ở Bảng 1 để kéo dữ liệu bán theo SKU.
          </div>
        )}

        {/* Table */}
        <div className="tbl-wrap" style={{ maxHeight: 500, overflowY: "auto" }}>
          <table>
            <thead><tr>
              <th style={{ width: 100 }}>SKU</th>
              <th>Tên sản phẩm</th>
              <th className="text-right" style={{ width: 60 }}>Tồn kho</th>
              <th className="text-right" style={{ width: 60 }}>Bán 30D</th>
              <th style={{ width: 140 }}>% Bán/Tồn</th>
              <th className="text-right" style={{ width: 75 }}>Giá vốn</th>
              <th className="text-right" style={{ width: 105 }}>Giá trị tồn</th>
            </tr></thead>
            <tbody>
              {analysisPaginated.map((a, idx) => {
                const pct = a.rate > 0 ? Math.min(a.rate, 100) : 0;
                const barColor = a.category === "no_sale" ? "#EF4444" : a.category === "slow" ? "#F59E0B" : a.category === "normal" ? "#3B82F6" : "#22C55E";
                const rateColor = a.rate > 100 ? (a.rate > 200 ? "#DC2626" : "#D97706") : a.category === "no_sale" ? "#EF4444" : a.category === "slow" ? "#D97706" : "#16A34A";
                return (
                  <tr key={`${a.sku}-${idx}`}>
                    <td style={{ fontFamily: "'SF Mono',Menlo,monospace", fontSize: 10, color: "#374151" }}>{a.sku}</td>
                    <td style={{ fontSize: 11, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.product_name || "—"}</td>
                    <td className="text-right" style={{ fontWeight: 700 }}>{a.stock > 0 ? a.stock.toLocaleString("vi-VN") : "—"}</td>
                    <td className="text-right" style={{ fontWeight: 700 }}>{a.sold > 0 ? a.sold.toLocaleString("vi-VN") : "—"}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ flex: 1, height: 8, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{
                            width: `${pct}%`, height: "100%", background: barColor,
                            borderRadius: 4, transition: "width 0.3s",
                            minWidth: pct > 0 ? 3 : 0,
                          }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: rateColor, minWidth: 32, textAlign: "right" }}>
                          {a.rate > 0 && a.rate < 9999 ? `${Math.round(a.rate)}%` : "—"}
                        </span>
                      </div>
                    </td>
                    <td className="text-right" style={{ fontSize: 11, color: "#9CA3AF" }}>{a.cost_price > 0 ? formatVND(a.cost_price) : "—"}</td>
                    <td className="text-right" style={{ fontWeight: 700, color: "#16A34A" }}>{a.stockValue > 0 ? formatVND(a.stockValue) : "—"}</td>
                  </tr>
                );
              })}
              {searchedAnalysis.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 20 }}>
                  {analysisError ? <span style={{ color: "#DC2626" }}>Lỗi: {analysisError}</span> : analysisLoading ? "Đang tải..." : "Không có data."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: "8px 16px", borderTop: "1px solid #E5E7EB", background: "#F9FAFB", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, fontWeight: 600, color: "#6B7280" }}>
          <div style={{ display: "flex", gap: 16 }}>
            <span>Tổng {analysisGroupTotals.count.toLocaleString("vi-VN")} SP</span>
            <span>Tổng tồn {analysisGroupTotals.stock.toLocaleString("vi-VN")}</span>
            <span>Bán 30d <span style={{ color: "#3B82F6", fontWeight: 800 }}>{analysisGroupTotals.sold.toLocaleString("vi-VN")}</span></span>
            <span>Giá trị tồn <span style={{ color: "#16A34A", fontWeight: 800 }}>{formatVND(analysisGroupTotals.value)}</span></span>
          </div>
          {analysisTotalPages > 1 && (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 10 }}>Trang {analysisPage}/{analysisTotalPages}</span>
              <button className="btn btn-ghost btn-xs" disabled={analysisPage <= 1} onClick={() => setAnalysisPage(analysisPage - 1)}>←</button>
              <button className="btn btn-ghost btn-xs" disabled={analysisPage >= analysisTotalPages} onClick={() => setAnalysisPage(analysisPage + 1)}>→</button>
            </div>
          )}
        </div>
      </div>
      </Collapsible>
    </section>
  );
}
