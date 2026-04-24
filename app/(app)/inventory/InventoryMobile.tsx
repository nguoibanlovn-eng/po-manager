"use client";

import { useState } from "react";
import { formatVNDCompact, fmtNum } from "@/lib/format";

export type InventoryMobileProps = {
  topSellers: { sku: string; name: string; category: string; stock: number; stockKhoTru: number; stockSsc: number; sold: number }[];
  noSales: { sku: string; name: string; category: string; stock: number; stockKhoTru: number; stockSsc: number; costValue: number }[];
  slowMovers: { sku: string; name: string; category: string; stock: number; sold: number; pctSold: number }[];
  stats: { total: number; inStock: number; outOfStock: number; lowStock: number; totalStock: number; totalKhoTru: number; totalSsc: number; totalValue: number; valueKhoTru: number; valueSsc: number };
};

export default function InventoryMobile(p: InventoryMobileProps) {
  const [tab, setTab] = useState<"top" | "slow" | "none">("top");
  const s = p.stats;
  const healthPct = s.total > 0 ? Math.round(s.inStock / s.total * 100) : 0;
  const lowPct = s.total > 0 ? Math.round(s.lowStock / s.total * 100) : 0;
  const outPct = s.total > 0 ? Math.round(s.outOfStock / s.total * 100) : 0;

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#7C3AED,#4C1D95)", padding: "14px 14px 16px", color: "#fff" }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Tồn kho</div>
        <div style={{ fontSize: 11, opacity: .6 }}>Nhanh (Kho Trữ) + SSC Fulfillment</div>
      </div>

      {/* Hero stats — 3 cards 1 dòng */}
      <div style={{ display: "flex", gap: 6, padding: "8px 10px 0", marginTop: -1, background: "linear-gradient(135deg,#7C3AED,#4C1D95)" }}>
        <div style={{ flex: 1, background: "rgba(255,255,255,.1)", borderRadius: 10, padding: "8px 6px", textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 8, opacity: .6 }}>Còn hàng</div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{fmtNum(s.inStock)}</div>
          <div style={{ fontSize: 8, opacity: .5 }}>/ {fmtNum(s.total)}</div>
        </div>
        <div style={{ flex: 1, background: "rgba(239,68,68,.2)", borderRadius: 10, padding: "8px 6px", textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 8, opacity: .6 }}>Hết hàng</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#FCA5A5" }}>{fmtNum(s.outOfStock)}</div>
          <div style={{ fontSize: 8, opacity: .5 }}>{outPct}%</div>
        </div>
        <div style={{ flex: 1, background: "rgba(245,158,11,.2)", borderRadius: 10, padding: "8px 6px", textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 8, opacity: .6 }}>Sắp hết</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#FCD34D" }}>{fmtNum(s.lowStock)}</div>
          <div style={{ fontSize: 8, opacity: .5 }}>{lowPct}%</div>
        </div>
      </div>

      {/* Tổng tồn kho + Giá trị — breakdown Kho Trữ / SSC */}
      <div style={{ padding: "8px 10px 0" }}>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600 }}>TỔNG TỒN KHO</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#1E293B" }}>{fmtNum(s.totalStock)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600 }}>GIÁ TRỊ TỒN</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#DC2626" }}>{formatVNDCompact(s.totalValue)}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, background: "#F0FDF4", borderRadius: 8, padding: "6px 10px" }}>
              <div style={{ fontSize: 8, color: "#6B7280", fontWeight: 600 }}>KHO TRỮ</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#16A34A" }}>{fmtNum(s.totalKhoTru)}</div>
              <div style={{ fontSize: 10, color: "#16A34A", fontWeight: 600 }}>{formatVNDCompact(s.valueKhoTru)}</div>
            </div>
            <div style={{ flex: 1, background: "#F5F3FF", borderRadius: 8, padding: "6px 10px" }}>
              <div style={{ fontSize: 8, color: "#6B7280", fontWeight: 600 }}>SSC</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#7C3AED" }}>{fmtNum(s.totalSsc)}</div>
              <div style={{ fontSize: 10, color: "#7C3AED", fontWeight: 600 }}>{formatVNDCompact(s.valueSsc)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Health bar */}
      <div style={{ padding: "8px 10px 0" }}>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "8px 12px" }}>
          <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 4 }}>
            <div style={{ width: `${healthPct}%`, background: "#22C55E" }} />
            <div style={{ width: `${lowPct}%`, background: "#F59E0B" }} />
            <div style={{ width: `${outPct}%`, background: "#EF4444" }} />
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: 9, color: "#64748B" }}>
            <span><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#22C55E", marginRight: 3, verticalAlign: "middle" }} />Đủ {healthPct}%</span>
            <span><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#F59E0B", marginRight: 3, verticalAlign: "middle" }} />Sắp hết {lowPct}%</span>
            <span><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#EF4444", marginRight: 3, verticalAlign: "middle" }} />Hết {outPct}%</span>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 4, padding: "10px 10px 0" }}>
        {([["top", "Bán chạy", "#16A34A"], ["slow", "Bán chậm", "#DC2626"], ["none", "Không bán", "#18181B"]] as const).map(([key, label, color]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
              background: tab === key ? color : "#F1F5F9",
              color: tab === key ? "#fff" : "#64748B",
            }}>{label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "8px 10px" }}>

        {/* BÁN CHẠY */}
        {tab === "top" && (
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "#94A3B8", padding: "4px 0 6px" }}>Bán nhiều nhất 30 ngày</div>
            {p.topSellers.map((r, i) => {
              const maxSold = p.topSellers[0]?.sold || 1;
              const barW = Math.round(r.sold / maxSold * 100);
              const stockAlert = r.stock <= 0 ? "#DC2626" : r.stock <= 5 ? "#D97706" : "#16A34A";
              return (
                <div key={r.sku} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: i < p.topSellers.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: i < 3 ? "#D97706" : "#94A3B8", width: 14, textAlign: "right" }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                    <div style={{ height: 3, background: "#F3F4F6", borderRadius: 2, marginTop: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${barW}%`, background: "#22C55E", borderRadius: 2 }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A" }}>{fmtNum(r.sold)} bán</div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: stockAlert }}>
                      {r.stock <= 0 ? "Hết" : `${fmtNum(r.stock)} tồn`}
                    </div>
                    {r.stock > 0 && (r.stockKhoTru > 0 || r.stockSsc > 0) && (
                      <div style={{ fontSize: 8, color: "#9CA3AF" }}>
                        {r.stockKhoTru > 0 && <span>KT:{fmtNum(r.stockKhoTru)} </span>}
                        {r.stockSsc > 0 && <span style={{ color: "#7C3AED" }}>SSC:{fmtNum(r.stockSsc)}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {p.topSellers.length === 0 && <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: "#94A3B8" }}>Chưa có dữ liệu bán hàng</div>}
          </div>
        )}

        {/* BÁN CHẬM */}
        {tab === "slow" && (
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "#94A3B8", padding: "4px 0 6px" }}>Có bán nhưng ít so với tồn</div>
            {p.slowMovers.map((r, i) => (
              <div key={r.sku} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: i < p.slowMovers.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#DC2626", width: 14, textAlign: "right" }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div style={{ height: 3, background: "#F3F4F6", borderRadius: 2, marginTop: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${r.pctSold}%`, background: "#EF4444", borderRadius: 2 }} />
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, minWidth: 55 }}>
                  <div style={{ fontSize: 10 }}><span style={{ fontWeight: 700, color: "#DC2626" }}>{fmtNum(r.stock)}</span> <span style={{ color: "#94A3B8" }}>tồn</span></div>
                  <div style={{ fontSize: 9 }}><span style={{ fontWeight: 600 }}>{fmtNum(r.sold)}</span> <span style={{ color: "#94A3B8" }}>bán</span> · <span style={{ fontWeight: 700, color: "#DC2626" }}>{r.pctSold}%</span></div>
                </div>
              </div>
            ))}
            {p.slowMovers.length === 0 && <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: "#94A3B8" }}>Không có SP bán chậm</div>}
          </div>
        )}

        {/* KHÔNG BÁN */}
        {tab === "none" && (
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "#94A3B8", padding: "4px 0 6px" }}>Tồn kho nhưng 0 bán trong 30 ngày</div>
            {p.noSales.map((r, i) => (
              <div key={r.sku} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: i < p.noSales.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#18181B", width: 14, textAlign: "right", background: "#18181B", borderRadius: 4, padding: "1px 3px", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#fff" }}>{i + 1}</span></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div style={{ fontSize: 8, color: "#94A3B8" }}>
                    {r.stockKhoTru > 0 && <span>KT:{fmtNum(r.stockKhoTru)} </span>}
                    {r.stockSsc > 0 && <span style={{ color: "#7C3AED" }}>SSC:{fmtNum(r.stockSsc)}</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#991B1B" }}>{fmtNum(r.stock)} tồn</div>
                  <div style={{ fontSize: 9, color: "#64748B" }}>{formatVNDCompact(r.costValue)}</div>
                </div>
              </div>
            ))}
            {p.noSales.length === 0 && <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: "#94A3B8" }}>Tất cả SP đều có bán</div>}
            {p.noSales.length > 0 && (() => {
              const totalCost = p.noSales.reduce((s, r) => s + r.costValue, 0);
              const totalStock = p.noSales.reduce((s, r) => s + r.stock, 0);
              return (
                <div style={{ padding: 8, background: "#18181B", borderRadius: 8, color: "#fff", marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                  <div><div style={{ fontSize: 8, opacity: .5 }}>{p.noSales.length} SKU · 0 bán</div><div style={{ fontWeight: 800 }}>{fmtNum(totalStock)} SP</div></div>
                  <div style={{ textAlign: "right" }}><div style={{ fontSize: 8, opacity: .5 }}>Vốn đọng</div><div style={{ fontWeight: 800, color: "#FCA5A5" }}>{formatVNDCompact(totalCost)}</div></div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
