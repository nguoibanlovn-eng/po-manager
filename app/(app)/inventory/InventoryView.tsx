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
  const [salesChannel, setSalesChannel] = useState("");
  const [salesSearch, setSalesSearch] = useState("");
  const [salesSort, setSalesSort] = useState("revenue_desc");
  const [salesPage, setSalesPage] = useState(1);

  // ─── Bảng 3 state ───
  const [analysisFilter, setAnalysisFilter] = useState("all");

  // ─── Bảng 1 totals ───
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
      const f = from || salesFrom;
      const t = to || salesTo;
      const params = new URLSearchParams({ from: f, to: t, sort: salesSort });
      if (salesChannel) params.set("channel", salesChannel);
      if (salesSearch) params.set("q", salesSearch);
      const res = await fetch(`/api/inventory/product-sales?${params}`);
      const json = await res.json();
      if (json.ok) {
        setSalesItems(json.items || []);
        setSalesSummary(json.summary || null);
        setSalesChannels(json.channels || []);
        setSalesLoaded(true);
        setSalesPage(1);
      }
    } catch { /* */ }
    finally { setSalesLoading(false); }
  }, [salesFrom, salesTo, salesChannel, salesSearch, salesSort]);

  function setDatePreset(key: string) {
    let f: string, t: string;
    if (key === "7d") { f = daysAgo(-7); t = daysAgo(0); }
    else if (key === "30d") { f = daysAgo(-30); t = daysAgo(0); }
    else if (key === "month") { const r = monthRange(0); f = r.from; t = r.to; }
    else if (key === "prev") { const r = monthRange(-1); f = r.from; t = r.to; }
    else { f = "2026-01-01"; t = daysAgo(0); }
    setSalesFrom(f); setSalesTo(t);
    loadSales(f, t);
  }

  // ─── Bảng 3: Analysis ───
  const analysis = useMemo(() => {
    // Build sales lookup from Bảng 2
    const salesMap = new Map<string, { qty: number; revenue: number }>();
    for (const s of salesItems) {
      salesMap.set(s.sku, { qty: s.qty, revenue: s.revenue });
    }

    return rows.map((r) => {
      const stock = toNum(r.available_qty);
      const soldFromSales = salesMap.get(r.sku)?.qty || 0;
      const sold = soldFromSales || toNum(r.sold_30d);
      const rate = stock > 0 ? (sold / stock) * 100 : sold > 0 ? 999 : 0;
      const stockValue = stock * toNum(r.sell_price);
      let category: string;
      if (!salesLoaded && sold === 0 && stock > 0) category = "no_data";
      else if (sold === 0 && stock <= 0) category = "no_data";
      else if (sold === 0) category = "no_sale";
      else if (rate < 10) category = "slow";
      else if (rate <= 30) category = "normal";
      else category = "good";
      return { ...r, sold, stock, rate, category, stockValue };
    });
  }, [rows, salesItems, salesLoaded]);

  const analysisCounts = useMemo(() => {
    const c = { no_sale: 0, slow: 0, normal: 0, good: 0, no_data: 0 };
    for (const a of analysis) c[a.category as keyof typeof c]++;
    return c;
  }, [analysis]);

  const filteredAnalysis = useMemo(() => {
    const list = analysisFilter === "all" ? analysis : analysis.filter((a) => a.category === analysisFilter);
    return list.sort((a, b) => b.stockValue - a.stockValue);
  }, [analysis, analysisFilter]);

  // Bảng 3 footer totals per group
  const analysisGroupTotals = useMemo(() => {
    const t = { stock: 0, sold: 0, value: 0 };
    for (const a of filteredAnalysis) { t.stock += a.stock; t.sold += a.sold; t.value += a.stockValue; }
    return t;
  }, [filteredAnalysis]);

  const SALES_PAGE_SIZE = 50;
  const salesTotalPages = Math.ceil(salesItems.length / SALES_PAGE_SIZE);
  const salesPaginated = salesItems.slice((salesPage - 1) * SALES_PAGE_SIZE, salesPage * SALES_PAGE_SIZE);

  return (
    <section className="section">
      {/* ═══ HEADER ═══ */}
      <div className="page-hdr">
        <div>
          <div className="page-title">Quản lý tồn kho</div>
          <div className="page-sub">Dữ liệu từ Nhanh.vn</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="btn btn-ghost btn-sm">Cài cảnh báo</button>
          <SyncButton url="/api/nhanh/sync-products" label="↻ Đồng bộ SP" onDone={() => router.refresh()} />
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════
         BẢNG 1 — DANH SÁCH SẢN PHẨM
         ═════════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Danh sách sản phẩm</div>
          <span className="muted" style={{ fontSize: 11 }}>{total.toLocaleString("vi-VN")} SP</span>
        </div>

        <form style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 8, alignItems: "center" }}>
          <input type="text" name="q" defaultValue={q} placeholder="Tìm SKU, tên..." style={{ width: 160, fontSize: 12 }} />
          <select name="filter" defaultValue={filter} style={{ fontSize: 12 }}>
            <option value="all">Tất cả tình trạng</option>
            <option value="in_stock">Còn hàng</option>
            <option value="low_stock">Sắp hết (≤5)</option>
            <option value="out_of_stock">Hết hàng</option>
          </select>
          <button type="submit" className="btn btn-primary btn-xs">Lọc</button>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#6B7280" }}>Đang bán · tồn nhiều nhất</span>
        </form>

        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th style={{ width: 120 }}>SKU</th>
              <th>Tên sản phẩm</th>
              <th className="text-right" style={{ width: 70 }}>Tồn kho</th>
              <th className="text-right" style={{ width: 90 }}>Giá vốn</th>
              <th className="text-right" style={{ width: 90 }}>Giá bán</th>
              <th style={{ width: 50 }}></th>
              <th style={{ width: 65 }}></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const avail = toNum(r.available_qty);
                const cost = toNum(r.cost_price);
                const sell = toNum(r.sell_price);
                return (
                  <tr key={r.sku}>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{r.sku}</td>
                    <td style={{ fontSize: 12 }}>{r.product_name || "—"}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{avail > 0 ? avail.toLocaleString("vi-VN") : "—"}</td>
                    <td className="text-right muted">{cost > 0 ? formatVND(cost) : "—"}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{sell > 0 ? formatVND(sell) : "—"}</td>
                    <td>{avail <= 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 3, background: "#FEE2E2", color: "#DC2626" }}>Hết</span>}</td>
                    <td><span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "#F0FDF4", color: "#16A34A" }}>Đang bán</span></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có SKU phù hợp.</td></tr>}
            </tbody>
            {/* Footer totals */}
            <tfoot>
              <tr style={{ background: "#F9FAFB", fontWeight: 700, fontSize: 12 }}>
                <td colSpan={2}>Tổng: {total.toLocaleString("vi-VN")} SKU</td>
                <td className="text-right">{invTotals.totalStock.toLocaleString("vi-VN")}</td>
                <td></td>
                <td className="text-right" style={{ color: "#16A34A" }}>{formatVNDCompact(invTotals.totalValue)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)" }}>
            <span className="muted" style={{ fontSize: 12 }}>Trang {page}/{totalPages}</span>
            <div style={{ display: "flex", gap: 4 }}>
              {page > 1 && <Link href={`/inventory?q=${q}&filter=${filter}&page=${page - 1}`} className="btn btn-ghost btn-xs" style={{ textDecoration: "none" }}>← Trước</Link>}
              {page < totalPages && <Link href={`/inventory?q=${q}&filter=${filter}&page=${page + 1}`} className="btn btn-ghost btn-xs" style={{ textDecoration: "none" }}>Sau →</Link>}
            </div>
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════
         BẢNG 2 — DỮ LIỆU BÁN HÀNG (23_ProductSales)
         ═════════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Bảng 2 — Dữ liệu bán hàng</div>
            <div style={{ fontSize: 10, color: "#6B7280" }}>product_sales · theo SKU, theo khoảng ngày</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <SyncButton url="/api/nhanh/sync-product-sales" label="⟳ Đồng bộ Nhanh" onDone={() => loadSales()} />
          </div>
        </div>

        {/* Time filters */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#6B7280" }}>Thời gian:</span>
          {[{ k: "7d", l: "7 ngày" }, { k: "30d", l: "30 ngày" }, { k: "month", l: "Tháng này" }, { k: "prev", l: "Tháng trước" }, { k: "all", l: "Tất cả" }].map((r) => (
            <button key={r.k} className="btn btn-ghost btn-xs" onClick={() => setDatePreset(r.k)}
              style={{ background: salesFrom === (r.k === "30d" ? daysAgo(-30) : undefined) ? undefined : undefined }}>{r.l}</button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
            <input type="date" value={salesFrom} onChange={(e) => setSalesFrom(e.target.value)} style={{ fontSize: 11, width: 120 }} />
            <span className="muted">→</span>
            <input type="date" value={salesTo} onChange={(e) => setSalesTo(e.target.value)} style={{ fontSize: 11, width: 120 }} />
            <button className="btn btn-primary btn-xs" onClick={() => loadSales()}>✓ Áp dụng</button>
            {salesLoaded && <span className="muted" style={{ fontSize: 10 }}>{salesFrom} → {salesTo}</span>}
          </div>
        </div>

        {/* Filters */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 8, alignItems: "center" }}>
          <input placeholder="Tìm SKU, tên SP..." value={salesSearch} onChange={(e) => setSalesSearch(e.target.value)} style={{ width: 160, fontSize: 12 }} />
          <select value={salesChannel} onChange={(e) => setSalesChannel(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">Tất cả kênh</option>
            {salesChannels.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
          </select>
          <select value={salesSort} onChange={(e) => setSalesSort(e.target.value)} style={{ fontSize: 12 }}>
            <option value="revenue_desc">Doanh thu cao nhất</option>
            <option value="revenue_asc">Doanh thu thấp nhất</option>
            <option value="qty_desc">Bán nhiều nhất</option>
            <option value="qty_asc">Bán ít nhất</option>
          </select>
          {salesLoaded && <button className="btn btn-ghost btn-xs" onClick={() => loadSales()}>⟳ Làm mới</button>}
        </div>

        {/* KPI cards */}
        {salesSummary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, borderBottom: "1px solid var(--border)" }}>
            {[
              { label: "Tổng SKU bán", value: salesSummary.totalSkus.toLocaleString("vi-VN"), color: "#3B82F6" },
              { label: "Tổng đơn", value: salesSummary.totalOrders.toLocaleString("vi-VN"), color: "#D97706" },
              { label: "Tổng sản lượng", value: salesSummary.totalQty.toLocaleString("vi-VN"), color: "#7C3AED" },
              { label: "Tổng doanh thu", value: formatVNDCompact(salesSummary.totalRevenue), color: "#16A34A" },
            ].map((k) => (
              <div key={k.label} style={{ padding: "10px 16px", borderRight: "1px solid #F3F4F6" }}>
                <div style={{ fontSize: 10, color: "#6B7280" }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Data table */}
        {salesLoaded ? (
          <>
            <div className="tbl-wrap" style={{ maxHeight: 400, overflowY: "auto" }}>
              <table>
                <thead><tr>
                  <th style={{ width: 120 }}>SKU</th>
                  <th>Tên SP</th>
                  <th>Kênh</th>
                  <th className="text-right" style={{ width: 60 }}>SL</th>
                  <th className="text-right" style={{ width: 60 }}>Đơn</th>
                  <th className="text-right" style={{ width: 100 }}>Doanh thu</th>
                </tr></thead>
                <tbody>
                  {salesPaginated.map((s, i) => (
                    <tr key={`${s.sku}-${i}`}>
                      <td style={{ fontFamily: "monospace", fontSize: 11 }}>{s.sku}</td>
                      <td style={{ fontSize: 12 }}>{s.product_name}</td>
                      <td className="muted" style={{ fontSize: 11 }}>{s.channels}</td>
                      <td className="text-right" style={{ fontWeight: 600 }}>{s.qty.toLocaleString("vi-VN")}</td>
                      <td className="text-right">{s.orders.toLocaleString("vi-VN")}</td>
                      <td className="text-right" style={{ color: "#16A34A", fontWeight: 700 }}>{formatVND(s.revenue)}</td>
                    </tr>
                  ))}
                  {salesItems.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có data bán hàng trong khoảng này.</td></tr>}
                </tbody>
              </table>
            </div>
            {salesTotalPages > 1 && (
              <div style={{ padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", fontSize: 12 }}>
                <span className="muted">Trang {salesPage}/{salesTotalPages} · {salesItems.length} SKU</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="btn btn-ghost btn-xs" disabled={salesPage <= 1} onClick={() => setSalesPage(salesPage - 1)}>←</button>
                  <button className="btn btn-ghost btn-xs" disabled={salesPage >= salesTotalPages} onClick={() => setSalesPage(salesPage + 1)}>→</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="muted" style={{ padding: 32, textAlign: "center", fontSize: 12 }}>
            Bấm <strong>⟳ Đồng bộ Nhanh</strong> hoặc <strong>✓ Áp dụng</strong> để tải dữ liệu bán hàng theo SP.
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════
         BẢNG 3 — PHÂN TÍCH BÁN / TỒN KHO
         ═════════════════════════════════════════════════════════ */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Bảng 3 — Phân tích bán / tồn kho</div>
            <div style={{ fontSize: 10, color: "#6B7280" }}>sold_qty ÷ stock × 100% · dùng chung khoảng ngày Bảng 2</div>
          </div>
        </div>

        {/* 5 category boxes */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", borderBottom: "1px solid var(--border)" }}>
          {[
            { k: "no_sale", label: "Không bán", sub: "0 đơn / 30 ngày", color: "#DC2626", icon: "🔴" },
            { k: "slow", label: "Bán chậm", sub: "< 10% tồn / tháng", color: "#D97706", icon: "🟡" },
            { k: "normal", label: "Bình thường", sub: "10–30%", color: "#3B82F6", icon: "🔵" },
            { k: "good", label: "Bán tốt", sub: "> 30% hoặc hết hàng", color: "#16A34A", icon: "🟢" },
            { k: "no_data", label: "Chưa có data", sub: "Chưa sync bán", color: "#9CA3AF", icon: "⚪" },
          ].map((c) => {
            const active = analysisFilter === c.k;
            const count = analysisCounts[c.k as keyof typeof analysisCounts];
            return (
              <button key={c.k} onClick={() => setAnalysisFilter(active ? "all" : c.k)}
                style={{
                  padding: "14px 16px", border: "none", cursor: "pointer", textAlign: "left",
                  background: active ? "#FAFAFA" : "#fff",
                  borderBottom: active ? `3px solid ${c.color}` : "3px solid transparent",
                  borderRight: "1px solid #F3F4F6",
                }}>
                <div style={{ fontWeight: 700, color: c.color, fontSize: 12 }}>{c.label}</div>
                <div style={{ width: 28, height: 3, background: c.color, borderRadius: 2, margin: "6px 0" }} />
                <div style={{ fontSize: 9, color: "#6B7280" }}>{c.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 8, alignItems: "center" }}>
          <select value={analysisFilter} onChange={(e) => setAnalysisFilter(e.target.value)} style={{ fontSize: 12 }}>
            <option value="all">Tất cả</option>
            <option value="no_sale">Không bán</option>
            <option value="slow">Bán chậm</option>
            <option value="normal">Bình thường</option>
            <option value="good">Bán tốt</option>
            <option value="no_data">Chưa có data</option>
          </select>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#6B7280" }}>Giá trị tồn cao nhất</span>
        </div>

        {/* Analysis table */}
        <div className="tbl-wrap" style={{ maxHeight: 500, overflowY: "auto" }}>
          <table>
            <thead><tr>
              <th style={{ width: 120 }}>SKU</th>
              <th>Tên sản phẩm</th>
              <th className="text-right" style={{ width: 70 }}>Tồn</th>
              <th className="text-right" style={{ width: 70 }}>Bán</th>
              <th className="text-right" style={{ width: 90 }}>Giá trị tồn</th>
              <th className="text-right" style={{ width: 70 }}>Tỉ lệ</th>
              <th style={{ width: 75 }}>Phân loại</th>
            </tr></thead>
            <tbody>
              {filteredAnalysis.slice(0, 200).map((a) => {
                const catColors: Record<string, string> = { no_sale: "#DC2626", slow: "#D97706", normal: "#3B82F6", good: "#16A34A", no_data: "#9CA3AF" };
                const catLabels: Record<string, string> = { no_sale: "Không bán", slow: "Chậm", normal: "TB", good: "Tốt", no_data: "—" };
                return (
                  <tr key={a.sku}>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{a.sku}</td>
                    <td style={{ fontSize: 12 }}>{a.product_name || "—"}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{a.stock > 0 ? a.stock.toLocaleString("vi-VN") : "—"}</td>
                    <td className="text-right">{a.sold > 0 ? a.sold.toLocaleString("vi-VN") : "—"}</td>
                    <td className="text-right muted">{a.stockValue > 0 ? formatVNDCompact(a.stockValue) : "—"}</td>
                    <td className="text-right" style={{ fontWeight: 700, color: catColors[a.category] }}>
                      {a.rate > 0 && a.rate < 999 ? `${a.rate.toFixed(1)}%` : "—"}
                    </td>
                    <td>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: `${catColors[a.category]}15`, color: catColors[a.category] }}>
                        {catLabels[a.category]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Footer totals */}
            <tfoot>
              <tr style={{ background: "#F9FAFB", fontWeight: 700, fontSize: 12 }}>
                <td colSpan={2}>{analysisFilter === "all" ? "Tổng tất cả" : `Tổng nhóm: ${analysisFilter}`} ({filteredAnalysis.length} SKU)</td>
                <td className="text-right">{analysisGroupTotals.stock.toLocaleString("vi-VN")}</td>
                <td className="text-right">{analysisGroupTotals.sold.toLocaleString("vi-VN")}</td>
                <td className="text-right" style={{ color: "#16A34A" }}>{formatVNDCompact(analysisGroupTotals.value)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}
