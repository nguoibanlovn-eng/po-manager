"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate, formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { InventoryRow } from "@/lib/db/inventory";
import SyncButton from "../components/SyncButton";

export default function InventoryView({
  rows, total, q, filter, page, totalPages,
}: {
  rows: InventoryRow[]; total: number; q: string; filter: string; page: number; totalPages: number;
}) {
  const router = useRouter();
  const [analysisFilter, setAnalysisFilter] = useState("all");

  // Analysis data: sell-through rate = sold_30d / stock
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
    if (analysisFilter === "all") return analysis.sort((a, b) => b.stock * (toNum(b.sold_30d) > 0 ? 1 : 0) - a.stock * (toNum(a.sold_30d) > 0 ? 1 : 0));
    return analysis.filter((a) => a.category === analysisFilter).sort((a, b) => b.stock - a.stock);
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
          <SyncButton url="/api/nhanh/sync-products" label="Đồng bộ SP" onDone={() => router.refresh()} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
         DANH SÁCH SẢN PHẨM
         ═══════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Danh sách sản phẩm</div>
          <span className="muted" style={{ fontSize: 11 }}>{total.toLocaleString("vi-VN")} SP</span>
        </div>

        {/* Filters — matching GAS layout */}
        <form style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="text" name="q" defaultValue={q} placeholder="Tìm SKU, tên SP..." style={{ width: 180, fontSize: 12 }} />
          <select name="filter" defaultValue={filter} style={{ fontSize: 12 }}>
            <option value="all">Tất cả tình trạng</option>
            <option value="in_stock">Còn hàng</option>
            <option value="low_stock">Sắp hết (≤5)</option>
            <option value="out_of_stock">Hết hàng</option>
          </select>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#6B7280" }}>Đang bán · tồn nhiều nhất</span>
          <button type="submit" className="btn btn-primary btn-xs">Lọc</button>
        </form>

        {/* Table */}
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th style={{ width: 130 }}>SKU</th>
              <th>Tên sản phẩm</th>
              <th className="text-right" style={{ width: 80 }}>Tồn kho</th>
              <th className="text-right" style={{ width: 80 }}>Giá vốn</th>
              <th className="text-right" style={{ width: 80 }}>Giá bán</th>
              <th style={{ width: 60 }}>Trạng thái</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const avail = toNum(r.available_qty);
                return (
                  <tr key={r.sku}>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{r.sku}</td>
                    <td style={{ fontSize: 12 }}>{r.product_name || "—"}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{avail > 0 ? avail.toLocaleString("vi-VN") : "—"}</td>
                    <td className="text-right muted">—</td>
                    <td className="text-right muted">—</td>
                    <td>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 3,
                        background: avail <= 0 ? "#FEE2E2" : "#F0FDF4",
                        color: avail <= 0 ? "#DC2626" : "#16A34A",
                      }}>
                        {avail <= 0 ? "Hết" : "Còn"}
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
            <SyncButton url="/api/nhanh/sync-sales" label="Đồng bộ Nhanh" onDone={() => router.refresh()} />
          </div>
        </div>

        {/* Time filters */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#6B7280" }}>Thời gian:</span>
          {["7 ngày", "30 ngày", "Tháng này", "Tháng trước", "Tất cả"].map((l, i) => (
            <button key={l} className="btn btn-ghost btn-xs" style={{ background: i === 1 ? "var(--blue)" : undefined, color: i === 1 ? "#fff" : undefined }}>{l}</button>
          ))}
        </div>

        {/* Filters row */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 8, alignItems: "center" }}>
          <input placeholder="Tìm SKU, tên SP..." style={{ width: 180, fontSize: 12 }} disabled />
          <select style={{ fontSize: 12 }} disabled><option>Tất cả kênh</option></select>
          <select style={{ fontSize: 12 }} disabled><option>Bán nhiều nhất</option></select>
          <select style={{ fontSize: 12 }} disabled><option>Tất cả SP</option></select>
        </div>

        <div className="muted" style={{ padding: 32, textAlign: "center", fontSize: 12 }}>
          Chưa có dữ liệu bán theo SKU. Cần sync đơn hàng chi tiết từ Nhanh.vn.
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
         BẢNG 2 — PHÂN TÍCH BÁN / TỒN KHO
         ═══════════════════════════════════════════════════════ */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Bảng 2 — Phân tích bán / tồn kho</div>
          <div style={{ fontSize: 10, color: "#6B7280" }}>sold_30d ÷ stock × 100% · dùng chung khoảng ngày Bảng 1</div>
        </div>

        {/* Category tabs — exact GAS style */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", borderBottom: "1px solid var(--border)" }}>
          {[
            { k: "no_sale", label: "Không bán", sub: "0 đơn / 30 ngày", color: "#DC2626" },
            { k: "slow", label: "Bán chậm", sub: "< 10% tồn / tháng", color: "#D97706" },
            { k: "normal", label: "Bình thường", sub: "10-30% tồn / tháng", color: "#3B82F6" },
            { k: "good", label: "Bán tốt", sub: "> 30% hoặc hết hàng", color: "#16A34A" },
            { k: "no_data", label: "Chưa có data", sub: "Chưa sync bán", color: "#9CA3AF" },
          ].map((c) => (
            <button key={c.k} onClick={() => setAnalysisFilter(analysisFilter === c.k ? "all" : c.k)}
              style={{
                padding: "14px 16px", border: "none", cursor: "pointer", textAlign: "left",
                background: analysisFilter === c.k ? "#FAFAFA" : "#fff",
                borderBottom: analysisFilter === c.k ? `3px solid ${c.color}` : "3px solid transparent",
              }}>
              <div style={{ fontWeight: 700, color: c.color, fontSize: 12 }}>{c.label}</div>
              <div style={{ width: 24, height: 3, background: c.color, borderRadius: 2, margin: "6px 0" }} />
              <div style={{ fontSize: 9, color: "#6B7280" }}>{c.sub}</div>
            </button>
          ))}
        </div>

        {/* Filters row */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 8, alignItems: "center" }}>
          <input placeholder="Tìm SKU, tên SP..." style={{ width: 180, fontSize: 12 }} disabled />
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
              <th style={{ width: 130 }}>SKU</th>
              <th>Tên sản phẩm</th>
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
                    <td className="text-right" style={{ fontWeight: 600 }}>{a.stock > 0 ? a.stock.toLocaleString("vi-VN") : "—"}</td>
                    <td className="text-right">{a.sold > 0 ? a.sold.toLocaleString("vi-VN") : "—"}</td>
                    <td className="text-right" style={{ fontWeight: 700, color: catColors[a.category] }}>
                      {a.rate > 0 && a.rate < 999 ? `${a.rate.toFixed(1)}%` : "—"}
                    </td>
                    <td>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
                        background: `${catColors[a.category]}15`,
                        color: catColors[a.category],
                      }}>
                        {catLabels[a.category]}
                      </span>
                    </td>
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
