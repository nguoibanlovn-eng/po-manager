"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate, formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { InventoryRow } from "@/lib/db/inventory";
import SyncButton from "../components/SyncButton";

/* ═══════════════════════════════════════════════════════════
   MAIN VIEW
   ═══════════════════════════════════════════════════════════ */
export default function InventoryView({
  rows, total, q, filter, page, totalPages,
}: {
  rows: InventoryRow[]; total: number; q: string; filter: string; page: number; totalPages: number;
}) {
  const router = useRouter();

  // Sales data state (Bảng 1)
  const [salesData, setSalesData] = useState<Array<{ sku: string; product_name: string; channel: string; revenue: number; orders: number }>>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesLoaded, setSalesLoaded] = useState(false);

  // Analysis state (Bảng 2)
  const [analysisFilter, setAnalysisFilter] = useState("all");

  // Load sales data
  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    try {
      const res = await fetch("/api/inventory/sales-analysis");
      const json = await res.json();
      if (json.ok) {
        setSalesData(json.items || []);
        setSalesLoaded(true);
      }
    } catch { /* */ }
    finally { setSalesLoading(false); }
  }, []);

  // Sales by SKU (for Bảng 1)
  const salesBySku = useMemo(() => {
    const m = new Map<string, { revenue: number; orders: number; channels: Set<string> }>();
    for (const s of salesData) {
      const cur = m.get(s.sku) || { revenue: 0, orders: 0, channels: new Set() };
      cur.revenue += s.revenue;
      cur.orders += s.orders;
      cur.channels.add(s.channel);
      m.set(s.sku, cur);
    }
    return m;
  }, [salesData]);

  // Analysis data (Bảng 2): sell-through rate = sold_30d / stock
  const analysis = useMemo(() => {
    return rows.map((r) => {
      const stock = toNum(r.available_qty);
      const sold = toNum(r.sold_30d);
      const rate = stock > 0 ? (sold / stock) * 100 : sold > 0 ? 999 : 0;
      let category: string;
      if (sold === 0 && stock > 0) category = "no_sale";
      else if (rate < 10) category = "slow";
      else if (rate <= 30) category = "normal";
      else if (rate > 30 || stock <= 0) category = "good";
      else category = "no_data";
      return { ...r, sold, stock, rate, category };
    });
  }, [rows]);

  const analysisCounts = useMemo(() => {
    const c = { no_sale: 0, slow: 0, normal: 0, good: 0, no_data: 0 };
    for (const a of analysis) c[a.category as keyof typeof c]++;
    return c;
  }, [analysis]);

  const filteredAnalysis = useMemo(() => {
    if (analysisFilter === "all") return analysis;
    return analysis.filter((a) => a.category === analysisFilter);
  }, [analysis, analysisFilter]);

  return (
    <section className="section">
      {/* ═══ HEADER ═══ */}
      <div className="page-hdr">
        <div>
          <div className="page-title">Quản lý tồn kho</div>
          <div className="page-sub">Dữ liệu từ Nhanh.vn · {total.toLocaleString("vi-VN")} SP</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <SyncButton url="/api/nhanh/sync-products" label="Đồng bộ SP" onDone={() => router.refresh()} />
        </div>
      </div>

      {/* ═══ BẢNG 1: DANH SÁCH SẢN PHẨM ═══ */}
      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Danh sách sản phẩm</div>
          <span className="muted" style={{ fontSize: 11 }}>{total.toLocaleString("vi-VN")} SP</span>
        </div>

        {/* Filters */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <form style={{ display: "flex", gap: 8, flex: 1, alignItems: "center" }}>
            <input type="text" name="q" defaultValue={q} placeholder="Tìm SKU, tên SP..." style={{ width: 200, fontSize: 12 }} />
            <select name="filter" defaultValue={filter} style={{ fontSize: 12 }}>
              <option value="all">Tất cả tình trạng</option>
              <option value="in_stock">Còn hàng</option>
              <option value="low_stock">Sắp hết (≤5)</option>
              <option value="out_of_stock">Hết hàng</option>
            </select>
            <button type="submit" className="btn btn-primary btn-xs">Lọc</button>
          </form>
        </div>

        {/* Table */}
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th style={{ width: 130 }}>SKU</th>
              <th>Tên sản phẩm</th>
              <th className="text-right" style={{ width: 70 }}>Tồn kho</th>
              <th className="text-right" style={{ width: 70 }}>Giá vốn</th>
              <th className="text-right" style={{ width: 70 }}>Bán 30d</th>
              <th style={{ width: 60 }}>Trạng thái</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const avail = toNum(r.available_qty);
                const sold = toNum(r.sold_30d);
                return (
                  <tr key={r.sku}>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{r.sku}</td>
                    <td style={{ fontSize: 12 }}>{r.product_name || "—"}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{avail.toLocaleString("vi-VN")}</td>
                    <td className="text-right muted">—</td>
                    <td className="text-right">{sold > 0 ? sold.toLocaleString("vi-VN") : "—"}</td>
                    <td>
                      <span className={`chip ${avail <= 0 ? "chip-red" : avail <= 5 ? "chip-amber" : "chip-green"}`} style={{ fontSize: 9 }}>
                        {avail <= 0 ? "Hết" : avail <= 5 ? "Ít" : "Còn"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có SKU phù hợp.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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

      {/* ═══ BẢNG 2: DỮ LIỆU BÁN HÀNG ═══ */}
      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Bảng 1 — Dữ liệu bán hàng</div>
            <div style={{ fontSize: 10, color: "#6B7280" }}>Từ nhanh.vn sales_sync</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <SyncButton url="/api/nhanh/sync-sales" label="Đồng bộ Nhanh" onDone={loadSales} />
            {!salesLoaded && <button className="btn btn-primary btn-xs" onClick={loadSales} disabled={salesLoading}>{salesLoading ? "Đang tải..." : "Tải dữ liệu"}</button>}
          </div>
        </div>

        {salesLoaded ? (
          <div className="tbl-wrap" style={{ maxHeight: 400, overflowY: "auto" }}>
            <table>
              <thead><tr>
                <th style={{ width: 130 }}>SKU</th>
                <th>Tên SP</th>
                <th>Kênh</th>
                <th className="text-right">Đơn</th>
                <th className="text-right">Doanh thu</th>
              </tr></thead>
              <tbody>
                {salesData.slice(0, 200).map((s, i) => (
                  <tr key={`${s.sku}-${s.channel}-${i}`}>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{s.sku}</td>
                    <td style={{ fontSize: 12 }}>{s.product_name}</td>
                    <td className="muted" style={{ fontSize: 11 }}>{s.channel}</td>
                    <td className="text-right">{s.orders}</td>
                    <td className="text-right" style={{ color: "#16A34A", fontWeight: 600 }}>{formatVNDCompact(s.revenue)}</td>
                  </tr>
                ))}
                {salesData.length === 0 && (
                  <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có data bán hàng.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="muted" style={{ padding: 24, textAlign: "center" }}>
            Bấm <strong>Tải dữ liệu</strong> để xem dữ liệu bán hàng.
          </div>
        )}
      </div>

      {/* ═══ BẢNG 3: PHÂN TÍCH BÁN / TỒN KHO ═══ */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Bảng 2 — Phân tích bán / tồn kho</div>
          <div style={{ fontSize: 10, color: "#6B7280" }}>sold_30d ÷ stock × 100%</div>
        </div>

        {/* Category KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0, borderBottom: "1px solid var(--border)" }}>
          {[
            { k: "no_sale", label: "Không bán", sub: "0 đơn / 30 ngày", color: "#DC2626" },
            { k: "slow", label: "Bán chậm", sub: "< 10% tồn / tháng", color: "#D97706" },
            { k: "normal", label: "Bình thường", sub: "10-30% tồn / tháng", color: "#3B82F6" },
            { k: "good", label: "Bán tốt", sub: "> 30% hoặc hết hàng", color: "#16A34A" },
            { k: "no_data", label: "Chưa có data", sub: "Chưa sync bán", color: "#9CA3AF" },
          ].map((c) => (
            <button key={c.k} onClick={() => setAnalysisFilter(analysisFilter === c.k ? "all" : c.k)}
              style={{
                padding: "12px 16px", border: "none", cursor: "pointer", textAlign: "left",
                background: analysisFilter === c.k ? "#F9FAFB" : "#fff",
                borderBottom: analysisFilter === c.k ? `3px solid ${c.color}` : "3px solid transparent",
              }}>
              <div style={{ fontWeight: 700, color: c.color, fontSize: 12 }}>{c.label}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: c.color, margin: "4px 0" }}>
                {analysisCounts[c.k as keyof typeof analysisCounts]}
              </div>
              <div style={{ fontSize: 9, color: "#6B7280" }}>{c.sub}</div>
            </button>
          ))}
        </div>

        {/* Analysis table */}
        <div className="tbl-wrap" style={{ maxHeight: 400, overflowY: "auto" }}>
          <table>
            <thead><tr>
              <th style={{ width: 130 }}>SKU</th>
              <th>Tên SP</th>
              <th className="text-right" style={{ width: 70 }}>Tồn</th>
              <th className="text-right" style={{ width: 70 }}>Bán 30d</th>
              <th className="text-right" style={{ width: 80 }}>Tỉ lệ</th>
              <th style={{ width: 80 }}>Phân loại</th>
            </tr></thead>
            <tbody>
              {filteredAnalysis.slice(0, 200).map((a) => {
                const catColors: Record<string, string> = { no_sale: "#DC2626", slow: "#D97706", normal: "#3B82F6", good: "#16A34A", no_data: "#9CA3AF" };
                const catLabels: Record<string, string> = { no_sale: "Không bán", slow: "Chậm", normal: "TB", good: "Tốt", no_data: "—" };
                return (
                  <tr key={a.sku}>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{a.sku}</td>
                    <td style={{ fontSize: 12 }}>{a.product_name || "—"}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{a.stock.toLocaleString("vi-VN")}</td>
                    <td className="text-right">{a.sold > 0 ? a.sold.toLocaleString("vi-VN") : "—"}</td>
                    <td className="text-right" style={{ fontWeight: 700, color: catColors[a.category] }}>{a.rate > 0 && a.rate < 999 ? `${a.rate.toFixed(1)}%` : "—"}</td>
                    <td><span style={{ fontSize: 9, fontWeight: 600, color: catColors[a.category] }}>{catLabels[a.category]}</span></td>
                  </tr>
                );
              })}
              {filteredAnalysis.length === 0 && (
                <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có SP phù hợp.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
