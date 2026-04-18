"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { InventoryRow } from "@/lib/db/inventory";
import SyncButton from "../components/SyncButton";

export default function InventoryView({
  rows, total, q, filter, page, totalPages,
}: {
  rows: InventoryRow[]; total: number; q: string; filter: string; page: number; totalPages: number;
}) {
  const router = useRouter();
  const [analysisFilter, setAnalysisFilter] = useState("all");
  const [salesRange, setSalesRange] = useState("30d");

  // Analysis: sell-through rate
  const analysis = useMemo(() => {
    return rows.map((r) => {
      const stock = toNum(r.available_qty);
      const sold = toNum(r.sold_30d);
      const rate = stock > 0 ? (sold / stock) * 100 : sold > 0 ? 999 : 0;
      let category: string;
      if (stock <= 0 && sold === 0) category = "no_data";
      else if (sold === 0) category = "no_sale";
      else if (rate < 10) category = "slow";
      else if (rate <= 30) category = "normal";
      else category = "good";
      return { ...r, sold, stock, rate, category };
    });
  }, [rows]);

  const analysisCounts = useMemo(() => {
    const c = { no_sale: 0, slow: 0, normal: 0, good: 0, no_data: 0 };
    for (const a of analysis) c[a.category as keyof typeof c]++;
    return c;
  }, [analysis]);

  const filteredAnalysis = useMemo(() => {
    const list = analysisFilter === "all" ? analysis : analysis.filter((a) => a.category === analysisFilter);
    return list.sort((a, b) => (b.stock * toNum(b.sell_price)) - (a.stock * toNum(a.sell_price)));
  }, [analysis, analysisFilter]);

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
          <SyncButton url="/api/nhanh/sync-products" label="◇ Đồng bộ SP" onDone={() => router.refresh()} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
         DANH SÁCH SẢN PHẨM
         ═══════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Danh sách sản phẩm</div>
          <span className="muted" style={{ fontSize: 11 }}>{total.toLocaleString("vi-VN")} SP</span>
        </div>

        {/* Filters — GAS style */}
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

        {/* Table — matching GAS columns */}
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th style={{ width: 120 }}>SKU</th>
              <th>Tên sản phẩm</th>
              <th className="text-right" style={{ width: 70 }}>Tồn kho</th>
              <th className="text-right" style={{ width: 90 }}>Giá vốn</th>
              <th className="text-right" style={{ width: 90 }}>Giá bán</th>
              <th style={{ width: 50 }}></th>
              <th style={{ width: 70 }}></th>
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
                    <td className="text-right" style={{ color: "#6B7280" }}>{cost > 0 ? formatVND(cost) : "—"}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{sell > 0 ? formatVND(sell) : "—"}</td>
                    <td>
                      {avail <= 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 3, background: "#FEE2E2", color: "#DC2626" }}>Hết</span>}
                    </td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "#F0FDF4", color: "#16A34A", cursor: "pointer" }}>Đang bán</span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có SKU phù hợp.</td></tr>
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

      {/* ═══════════════════════════════════════════════════════
         BẢNG 1 — DỮ LIỆU BÁN HÀNG
         ═══════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Bảng 1 — Dữ liệu bán hàng</div>
            <div style={{ fontSize: 10, color: "#6B7280" }}>sheet 23_ProductSales</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <SyncButton url="/api/nhanh/sync-product-sales" label="◇ Đồng bộ Nhanh" onDone={() => router.refresh()} />
            <button className="btn btn-ghost btn-xs">📊 Xem nhiều hơn</button>
          </div>
        </div>

        {/* Time filters — GAS style */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#6B7280" }}>Thời gian:</span>
          {[
            { k: "7d", label: "7 ngày" },
            { k: "30d", label: "30 ngày" },
            { k: "month", label: "Tháng này" },
            { k: "prev", label: "Tháng trước" },
            { k: "all", label: "Tất cả" },
          ].map((r) => (
            <button key={r.k} className="btn btn-ghost btn-xs"
              style={{ background: salesRange === r.k ? "var(--blue)" : undefined, color: salesRange === r.k ? "#fff" : undefined }}
              onClick={() => setSalesRange(r.k)}>{r.label}</button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
            <input type="date" style={{ fontSize: 11, width: 120 }} disabled />
            <span className="muted">→</span>
            <input type="date" style={{ fontSize: 11, width: 120 }} disabled />
            <button className="btn btn-primary btn-xs" disabled>✓ Áp dụng</button>
          </div>
        </div>

        {/* Filter row */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 8, alignItems: "center" }}>
          <input placeholder="Tìm SKU, tên SP..." style={{ width: 160, fontSize: 12 }} disabled />
          <select style={{ fontSize: 12 }} disabled><option>Tất cả kênh</option></select>
          <select style={{ fontSize: 12 }} disabled><option>Bán nhiều nhất</option></select>
          <select style={{ fontSize: 12 }} disabled><option>Tất cả SP</option></select>
        </div>

        <div className="muted" style={{ padding: 32, textAlign: "center", fontSize: 12 }}>
          Bấm <strong>◇ Đồng bộ Nhanh</strong> để tải dữ liệu bán hàng theo SP.
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
         BẢNG 2 — PHÂN TÍCH BÁN / TỒN KHO
         ═══════════════════════════════════════════════════════ */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Bảng 2 — Phân tích bán / tồn kho</div>
            <div style={{ fontSize: 10, color: "#6B7280" }}>sold_30d ÷ stock × 100% · dùng chung khoảng ngày Bảng 1</div>
          </div>
          <button className="btn btn-ghost btn-xs">📊 Xem nhiều hơn</button>
        </div>

        {/* 5 category boxes — GAS style with colored bars */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", borderBottom: "1px solid var(--border)" }}>
          {[
            { k: "no_sale", label: "Không bán", sub: "0 đơn / 30 ngày", color: "#DC2626" },
            { k: "slow", label: "Bán chậm", sub: "< 10% tồn / tháng", color: "#D97706" },
            { k: "normal", label: "Bình thường", sub: "10-30% tồn / tháng", color: "#3B82F6" },
            { k: "good", label: "Bán tốt", sub: "> 30% hoặc hết hàng", color: "#16A34A" },
            { k: "no_data", label: "Chưa có data", sub: "Chưa sync bán", color: "#9CA3AF" },
          ].map((c) => {
            const active = analysisFilter === c.k;
            return (
              <button key={c.k} onClick={() => setAnalysisFilter(active ? "all" : c.k)}
                style={{
                  padding: "14px 16px", border: "none", cursor: "pointer", textAlign: "left",
                  background: active ? "#FAFAFA" : "#fff",
                  borderBottom: active ? `3px solid ${c.color}` : "3px solid transparent",
                  borderRight: "1px solid #F3F4F6",
                }}>
                <div style={{ fontWeight: 700, color: c.color, fontSize: 12 }}>{c.label}</div>
                <div style={{ width: 28, height: 3, background: c.color, borderRadius: 2, margin: "8px 0" }} />
                <div style={{ fontSize: 9, color: "#6B7280" }}>{c.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Filter row */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 8, alignItems: "center" }}>
          <input placeholder="Tìm SKU, tên SP..." style={{ width: 160, fontSize: 12 }} disabled />
          <select style={{ fontSize: 12 }} value={analysisFilter} onChange={(e) => setAnalysisFilter(e.target.value)}>
            <option value="all">Tất cả</option>
            <option value="no_sale">Không bán</option>
            <option value="slow">Bán chậm</option>
            <option value="normal">Bình thường</option>
            <option value="good">Bán tốt</option>
            <option value="no_data">Chưa có data</option>
          </select>
          <select style={{ fontSize: 12 }} disabled><option>Giá trị tồn cao nhất</option></select>
          <select style={{ fontSize: 12 }} disabled><option>Tất cả danh mục</option></select>
        </div>

        {/* Analysis table */}
        <div className="tbl-wrap" style={{ maxHeight: 500, overflowY: "auto" }}>
          <table>
            <thead><tr>
              <th style={{ width: 120 }}>SKU</th>
              <th>Tên sản phẩm</th>
              <th className="text-right" style={{ width: 70 }}>Tồn</th>
              <th className="text-right" style={{ width: 70 }}>Bán 30d</th>
              <th className="text-right" style={{ width: 90 }}>Giá trị tồn</th>
              <th className="text-right" style={{ width: 70 }}>Tỉ lệ</th>
              <th style={{ width: 70 }}>Phân loại</th>
            </tr></thead>
            <tbody>
              {filteredAnalysis.slice(0, 200).map((a) => {
                const catColors: Record<string, string> = { no_sale: "#DC2626", slow: "#D97706", normal: "#3B82F6", good: "#16A34A", no_data: "#9CA3AF" };
                const catLabels: Record<string, string> = { no_sale: "Không bán", slow: "Chậm", normal: "TB", good: "Tốt", no_data: "—" };
                const stockValue = a.stock * toNum(a.sell_price);
                return (
                  <tr key={a.sku}>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{a.sku}</td>
                    <td style={{ fontSize: 12 }}>{a.product_name || "—"}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{a.stock > 0 ? a.stock.toLocaleString("vi-VN") : "—"}</td>
                    <td className="text-right">{a.sold > 0 ? a.sold.toLocaleString("vi-VN") : "—"}</td>
                    <td className="text-right" style={{ color: "#6B7280" }}>{stockValue > 0 ? formatVNDCompact(stockValue) : "—"}</td>
                    <td className="text-right" style={{ fontWeight: 700, color: catColors[a.category] }}>
                      {a.rate > 0 && a.rate < 999 ? `${a.rate.toFixed(1)}%` : "—"}
                    </td>
                    <td>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
                        background: `${catColors[a.category]}15`, color: catColors[a.category],
                      }}>
                        {catLabels[a.category]}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredAnalysis.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có SP phù hợp.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
