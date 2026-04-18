"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { InventoryRow } from "@/lib/db/inventory";
import SyncButton from "../components/SyncButton";

type SalesItem = { sku: string; product_name: string; channels: string; qty: number; orders: number; revenue: number };
type SalesSummary = { totalSkus: number; totalOrders: number; totalQty: number; totalRevenue: number };

function daysAgo(d: number): string { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().substring(0, 10); }
function monthRange(offset: number) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth() + offset;
  const first = new Date(y, m, 1); const last = offset === 0 ? now : new Date(y, m + 1, 0);
  return { from: first.toISOString().substring(0, 10), to: last.toISOString().substring(0, 10) };
}

const CAT_GROUPS = [
  { k: "no_sale", label: "Không bán", sub: "0 đơn / 30 ngày", bg: "#FCEBEB", color: "#A32D2D", icon: "🔴" },
  { k: "slow", label: "Bán chậm", sub: "< 10% tồn/tháng", bg: "#FAEEDA", color: "#854F0B", icon: "🟡" },
  { k: "normal", label: "Bình thường", sub: "10–30%", bg: "#E6F1FB", color: "#185FA5", icon: "🔵" },
  { k: "good", label: "Bán tốt", sub: "> 30% hoặc hết hàng", bg: "#EAF3DE", color: "#3B6D11", icon: "🟢" },
  { k: "no_data", label: "Chưa có data", sub: "Chưa sync bán", bg: "#F1EFE8", color: "#444441", icon: "⚪" },
];

/** Sync sales button — splits long ranges into monthly chunks */
function SyncSalesButton({ onDone, from, to }: { onDone: () => void; from: string; to: string }) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState("");

  async function run() {
    setSyncing(true); setProgress("Bắt đầu...");
    try {
      // Split into chunks of max 30 days
      const chunks: Array<{ from: string; to: string }> = [];
      let cursor = new Date(from + "T00:00:00Z");
      const end = new Date(to + "T00:00:00Z");
      while (cursor <= end) {
        const chunkEnd = new Date(cursor);
        chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 29);
        const cTo = chunkEnd > end ? to : chunkEnd.toISOString().substring(0, 10);
        chunks.push({ from: cursor.toISOString().substring(0, 10), to: cTo });
        cursor = new Date(chunkEnd);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      let totalRows = 0, totalOrders = 0;
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        setProgress(`Chunk ${i + 1}/${chunks.length}: ${c.from} → ${c.to}...`);
        const res = await fetch("/api/nhanh/sync-product-sales", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(c),
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
        setProgress(`Chunk ${i + 1}/${chunks.length} ✓ ${totalRows} dòng`);
      }
      setProgress(`✓ Xong: ${totalOrders} đơn → ${totalRows} dòng`);
      onDone();
      setTimeout(() => setProgress(""), 5000);
    } catch (e) {
      setProgress(`Lỗi: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button onClick={run} disabled={syncing}
        style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, border: "none", cursor: syncing ? "wait" : "pointer", background: "#EAF3DE", color: "#3B6D11" }}>
        {syncing ? "Đang sync..." : "⟳ Đồng bộ Nhanh"}
      </button>
      {progress && <span style={{ fontSize: 10, color: progress.startsWith("✓") ? "#16A34A" : progress.startsWith("Lỗi") ? "#DC2626" : "#6B7280" }}>{progress}</span>}
    </div>
  );
}

export default function InventoryView({
  rows, total, q, filter, page, totalPages,
}: {
  rows: InventoryRow[]; total: number; q: string; filter: string; page: number; totalPages: number;
}) {
  const router = useRouter();

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
      totalValue += stock * toNum(r.sell_price);
    }
    return { totalStock, totalValue };
  }, [rows]);

  // ─── Bảng 2: Load sales ───
  const loadSales = useCallback(async (from?: string, to?: string) => {
    setSalesLoading(true);
    try {
      const f = from || salesFrom; const t = to || salesTo;
      const params = new URLSearchParams({ from: f, to: t, sort: salesSort });
      if (salesChannel) params.set("channel", salesChannel);
      if (salesSearch) params.set("q", salesSearch);
      const res = await fetch(`/api/inventory/product-sales?${params}`);
      const json = await res.json();
      if (json.ok) { setSalesItems(json.items || []); setSalesSummary(json.summary || null); setSalesChannels(json.channels || []); setSalesLoaded(true); setSalesPage(1); }
    } catch { /* */ } finally { setSalesLoading(false); }
  }, [salesFrom, salesTo, salesChannel, salesSearch, salesSort]);

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

  // ─── Bảng 3: Analysis ───
  const analysis = useMemo(() => {
    const salesMap = new Map<string, number>();
    for (const s of salesItems) salesMap.set(s.sku, s.qty);
    return rows.map((r) => {
      const stock = toNum(r.available_qty);
      const sold = salesMap.get(r.sku) || toNum(r.sold_30d);
      const rate = stock > 0 ? (sold / stock) * 100 : sold > 0 ? 999 : 0;
      const stockValue = stock * toNum(r.sell_price);
      let category: string;
      if (!salesLoaded && sold === 0 && stock > 0) category = "no_data";
      else if (stock <= 0 && sold === 0) category = "no_data";
      else if (sold === 0) category = "no_sale";
      else if (rate < 10) category = "slow";
      else if (rate <= 30) category = "normal";
      else category = "good";
      return { ...r, sold, stock, rate, category, stockValue };
    });
  }, [rows, salesItems, salesLoaded]);

  const analysisCounts = useMemo(() => {
    const c: Record<string, number> = { no_sale: 0, slow: 0, normal: 0, good: 0, no_data: 0 };
    for (const a of analysis) c[a.category]++;
    return c;
  }, [analysis]);

  const filteredAnalysis = useMemo(() => {
    let list = analysisFilter === "all" ? analysis : analysis.filter((a) => a.category === analysisFilter);
    if (analysisSort === "value_desc") list = [...list].sort((a, b) => b.stockValue - a.stockValue);
    else if (analysisSort === "rate_desc") list = [...list].sort((a, b) => b.rate - a.rate);
    else if (analysisSort === "sold_desc") list = [...list].sort((a, b) => b.sold - a.sold);
    else if (analysisSort === "stock_desc") list = [...list].sort((a, b) => b.stock - a.stock);
    return list;
  }, [analysis, analysisFilter, analysisSort]);

  const analysisGroupTotals = useMemo(() => {
    const t = { count: 0, stock: 0, sold: 0, value: 0 };
    for (const a of filteredAnalysis) { t.count++; t.stock += a.stock; t.sold += a.sold; t.value += a.stockValue; }
    return t;
  }, [filteredAnalysis]);

  return (
    <section className="section">
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
         CARD 1 — DANH SÁCH SẢN PHẨM
         ═════════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 14, padding: 0 }}>
        <form style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, alignItems: "center", background: "var(--bg)", fontSize: 11 }}>
          <input type="text" name="q" defaultValue={q} placeholder="Tìm SKU, tên..." style={{ width: 180, fontSize: 11 }} />
          <select name="filter" defaultValue={filter} style={{ fontSize: 11 }}>
            <option value="all">Tất cả tình trạng</option>
            <option value="in_stock">Còn hàng</option>
            <option value="low_stock">Sắp hết (≤10)</option>
            <option value="out_of_stock">Hết hàng</option>
          </select>
          <select style={{ fontSize: 11 }} disabled><option>Đang bán · tồn nhiều nhất</option><option>Tồn nhiều nhất</option><option>Tồn ít nhất</option><option>Giá trị tồn cao nhất</option><option>Tên A→Z</option></select>
          <button type="submit" className="btn btn-primary btn-xs">Lọc</button>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#6B7280" }}>{total.toLocaleString("vi-VN")} SP</span>
        </form>

        <div className="tbl-wrap" style={{ maxHeight: 280, overflowY: "auto" }}>
          <table>
            <thead><tr>
              <th style={{ width: 110 }}>SKU</th><th>Tên sản phẩm</th>
              <th className="text-right" style={{ width: 65 }}>Tồn kho</th>
              <th className="text-right" style={{ width: 80 }}>Giá vốn</th>
              <th className="text-right" style={{ width: 80 }}>Giá bán</th>
              <th style={{ width: 50 }}></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const avail = toNum(r.available_qty);
                return (
                  <tr key={r.sku}>
                    <td style={{ fontFamily: "monospace", fontSize: 10 }}>{r.sku}</td>
                    <td style={{ fontSize: 11 }}>{r.product_name || "—"}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{avail > 0 ? avail.toLocaleString("vi-VN") : "—"}</td>
                    <td className="text-right muted" style={{ fontSize: 11 }}>{toNum(r.cost_price) > 0 ? formatVND(toNum(r.cost_price)) : "—"}</td>
                    <td className="text-right" style={{ fontWeight: 600, fontSize: 11 }}>{toNum(r.sell_price) > 0 ? formatVND(toNum(r.sell_price)) : "—"}</td>
                    <td>{avail <= 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "#FEE2E2", color: "#DC2626" }}>Hết</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer totals */}
        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", background: "var(--bg)", display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600, color: "#6B7280" }}>
          <span>Tổng: {total.toLocaleString("vi-VN")} SKU</span>
          <span>Tồn: {invTotals.totalStock.toLocaleString("vi-VN")}</span>
          <span>Giá trị tồn: <span style={{ color: "#16A34A" }}>{formatVNDCompact(invTotals.totalValue)}</span></span>
        </div>

        {totalPages > 1 && (
          <div style={{ padding: "6px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #F3F4F6" }}>
            <span className="muted" style={{ fontSize: 10 }}>Trang {page}/{totalPages}</span>
            <div style={{ display: "flex", gap: 4 }}>
              {page > 1 && <Link href={`/inventory?q=${q}&filter=${filter}&page=${page - 1}`} className="btn btn-ghost btn-xs" style={{ textDecoration: "none" }}>←</Link>}
              {page < totalPages && <Link href={`/inventory?q=${q}&filter=${filter}&page=${page + 1}`} className="btn btn-ghost btn-xs" style={{ textDecoration: "none" }}>→</Link>}
            </div>
          </div>
        )}
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
          <div style={{ display: "flex", gap: 6 }}>
            <SyncSalesButton onDone={() => loadSales()} from={salesFrom} to={salesTo} />
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

        {/* KPI cards */}
        {salesSummary && (
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
            {salesLoading ? "Đang tải..." : "Bấm ⟳ Đồng bộ Nhanh hoặc chọn khoảng ngày → ✓ Áp dụng"}
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
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Bảng 2 — Phân tích bán / tồn kho</div>
            <div style={{ fontSize: 10, color: "#6B7280" }}>sold_30d ÷ stock × 100% · dùng chung khoảng ngày Bảng 1</div>
          </div>
          {salesLoaded && <span style={{ fontSize: 9, background: "#E6F1FB", color: "#185FA5", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>{salesFrom} → {salesTo}</span>}
        </div>

        {/* 5 group cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0, borderBottom: "1px solid var(--border)" }}>
          {CAT_GROUPS.map((c) => {
            const active = analysisFilter === c.k;
            const count = analysisCounts[c.k] || 0;
            return (
              <button key={c.k} onClick={() => setAnalysisFilter(active ? "all" : c.k)}
                style={{
                  padding: 12, border: "none", cursor: "pointer", textAlign: "left",
                  background: c.bg, borderRight: "1px solid #fff",
                  outline: active ? `1.5px solid ${c.color}` : "none", outlineOffset: -1,
                }}>
                <div style={{ fontSize: 11, color: c.color, fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: c.color, margin: "4px 0" }}>{count}</div>
                <div style={{ fontSize: 9, color: c.color, opacity: 0.7 }}>{c.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div style={{ padding: "8px 14px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
          <select value={analysisFilter} onChange={(e) => setAnalysisFilter(e.target.value)} style={{ fontSize: 11 }}>
            <option value="all">Tất cả nhóm</option>
            {CAT_GROUPS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
          </select>
          <select value={analysisSort} onChange={(e) => setAnalysisSort(e.target.value)} style={{ fontSize: 11 }}>
            <option value="value_desc">Giá trị tồn cao nhất</option>
            <option value="rate_desc">% bán/tồn cao nhất</option>
            <option value="sold_desc">SL bán nhiều nhất</option>
            <option value="stock_desc">Tồn nhiều nhất</option>
          </select>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#6B7280" }}>{filteredAnalysis.length} kết quả</span>
        </div>

        {/* Warning box for no_data */}
        {analysisFilter === "no_data" && (
          <div style={{ margin: "8px 14px", padding: "10px 14px", background: "#E6F1FB", borderRadius: 8, fontSize: 11, color: "#185FA5" }}>
            Các SP này chưa có data bán hàng. Bấm <strong>⟳ Đồng bộ Nhanh</strong> ở Bảng 1 để kéo dữ liệu bán theo SKU.
          </div>
        )}

        {/* Table */}
        <div className="tbl-wrap" style={{ maxHeight: 400, overflowY: "auto" }}>
          <table>
            <thead><tr>
              <th style={{ width: 110 }}>SKU</th><th>Tên sản phẩm</th>
              <th className="text-right" style={{ width: 65 }}>Tồn</th>
              <th className="text-right" style={{ width: 60 }}>Bán</th>
              <th className="text-right" style={{ width: 80 }}>Giá trị tồn</th>
              <th className="text-right" style={{ width: 60 }}>Tỉ lệ</th>
              <th style={{ width: 70 }}>Nhóm</th>
            </tr></thead>
            <tbody>
              {filteredAnalysis.slice(0, 200).map((a) => {
                const cg = CAT_GROUPS.find((c) => c.k === a.category);
                return (
                  <tr key={a.sku}>
                    <td style={{ fontFamily: "monospace", fontSize: 10 }}>{a.sku}</td>
                    <td style={{ fontSize: 11 }}>{a.product_name || "—"}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{a.stock > 0 ? a.stock.toLocaleString("vi-VN") : "—"}</td>
                    <td className="text-right">{a.sold > 0 ? a.sold.toLocaleString("vi-VN") : "—"}</td>
                    <td className="text-right muted" style={{ fontSize: 11 }}>{a.stockValue > 0 ? formatVNDCompact(a.stockValue) : "—"}</td>
                    <td className="text-right" style={{ fontWeight: 700, color: cg?.color }}>{a.rate > 0 && a.rate < 999 ? `${a.rate.toFixed(1)}%` : "—"}</td>
                    <td><span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: cg?.bg, color: cg?.color }}>{cg?.label || "—"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer totals */}
        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", background: "var(--bg)", display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600, color: "#6B7280" }}>
          <span>Nhóm: {analysisFilter === "all" ? "Tất cả" : CAT_GROUPS.find((c) => c.k === analysisFilter)?.label} ({analysisGroupTotals.count} SKU)</span>
          <span>Tồn: {analysisGroupTotals.stock.toLocaleString("vi-VN")}</span>
          <span>Bán: {analysisGroupTotals.sold.toLocaleString("vi-VN")}</span>
          <span>Giá trị: <span style={{ color: "#16A34A" }}>{formatVNDCompact(analysisGroupTotals.value)}</span></span>
        </div>
      </div>
    </section>
  );
}
