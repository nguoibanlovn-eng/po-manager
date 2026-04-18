"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { SalesSyncRow } from "@/lib/db/webapp";
import TargetProgressBar from "../components/TargetProgressBar";

const BRAND = "#6366F1";

function daysAgo(d: number): string {
  const dt = new Date(); dt.setDate(dt.getDate() + d);
  return dt.toISOString().substring(0, 10);
}
function monthRange(offset: number) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth() + offset;
  const first = new Date(y, m, 1); const last = offset === 0 ? now : new Date(y, m + 1, 0);
  return { from: first.toISOString().substring(0, 10), to: last.toISOString().substring(0, 10) };
}
const QUICK_RANGES = [
  { key: "7d", label: "7 ngày", from: daysAgo(-7), to: daysAgo(0) },
  { key: "30d", label: "30 ngày", from: daysAgo(-30), to: daysAgo(0) },
  { key: "month", label: "Tháng này", ...monthRange(0) },
  { key: "prev", label: "Tháng trước", ...monthRange(-1) },
];

// Fixed web/app sources (matching GAS)
const WEB_SOURCES = ["WEB - Bán sỉ/bán buôn", "App Lỗ Vũ", "WEB - LynkID", "https://lovu.vn", "WEB - Muagimuadi", "https://velasboost.vn"];

export default function WebAppView({
  rows, from, to, monthTarget = 0, monthActual = 0, monthKey = "",
}: {
  rows: SalesSyncRow[];
  from: string; to: string;
  monthTarget?: number; monthActual?: number; monthKey?: string;
}) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  function apply() { router.push(`/web-app?from=${f}&to=${t}`); }
  function quickRange(qr: { from: string; to: string }) { router.push(`/web-app?from=${qr.from}&to=${qr.to}`); }

  // Totals
  const totals = useMemo(() => rows.reduce(
    (a, r) => ({ orders: a.orders + toNum(r.order_net), revenue: a.revenue + toNum(r.revenue_net) }),
    { orders: 0, revenue: 0 },
  ), [rows]);

  // By source — only web sources
  const bySource = useMemo(() => {
    const m = new Map<string, { orders: number; revenue: number }>();
    for (const r of rows) {
      const src = r.source || r.channel || "Khác";
      if (!WEB_SOURCES.includes(src)) continue;
      const cur = m.get(src) || { orders: 0, revenue: 0 };
      cur.orders += toNum(r.order_net);
      cur.revenue += toNum(r.revenue_net);
      m.set(src, cur);
    }
    const webTotal = Array.from(m.values()).reduce((s, v) => s + v.revenue, 0);
    return {
      sources: Array.from(m.entries())
        .map(([name, v]) => ({ name, ...v, pct: webTotal > 0 ? (v.revenue / webTotal) * 100 : 0 }))
        .sort((a, b) => b.revenue - a.revenue),
      total: webTotal,
    };
  }, [rows]);

  // By date for chart
  const dailyChart = useMemo(() => {
    const m = new Map<string, { revenue: number; orders: number }>();
    for (const r of rows) {
      const src = r.source || "";
      if (!WEB_SOURCES.includes(src)) continue;
      const d = String(r.period_from || "").substring(0, 10);
      if (!d) continue;
      const cur = m.get(d) || { revenue: 0, orders: 0 };
      cur.revenue += toNum(r.revenue_net);
      cur.orders += toNum(r.order_net);
      m.set(d, cur);
    }
    return Array.from(m.entries()).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  const maxRev = Math.max(...dailyChart.map((d) => d.revenue), 1);
  const today = new Date().toISOString().substring(0, 10);
  const labelStep = Math.max(1, Math.ceil(dailyChart.length / 15));

  return (
    <section className="section">
      {/* ═══ HEADER ═══ */}
      <div className="page-hdr">
        <div>
          <div className="page-title">
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: BRAND, color: "#fff", fontSize: 12, fontWeight: 700, marginRight: 8, verticalAlign: "middle" }}>W</span>
            Web/App B2B
          </div>
          <div className="page-sub">Velasboost &amp; Muagimuadi · {from} → {to}</div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {QUICK_RANGES.map((r) => {
            const active = from === r.from && to === r.to;
            return (
              <button key={r.key} className="btn btn-ghost btn-xs" onClick={() => quickRange(r)}
                style={{ background: active ? BRAND : undefined, color: active ? "#fff" : undefined }}>
                {r.label}
              </button>
            );
          })}
          <input type="date" value={f} onChange={(e) => setF(e.target.value)} style={{ fontSize: 12, width: 130 }} />
          <span className="muted">→</span>
          <input type="date" value={t} onChange={(e) => setT(e.target.value)} style={{ fontSize: 12, width: 130 }} />
          <button className="btn btn-primary btn-xs" onClick={apply}>Áp dụng</button>
        </div>
      </div>

      {/* ═══ TARGET PROGRESS ═══ */}
      <TargetProgressBar channel="Web/App B2B" monthTarget={monthTarget} monthActual={monthActual} monthKey={monthKey} color={BRAND} />

      {/* ═══ KPI CARDS ═══ */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <div className="stat-card" style={{ borderLeft: `4px solid ${BRAND}` }}>
          <div className="sl">DOANH THU WEB/APP B2B</div>
          <div className="sv" style={{ color: "#16A34A" }}>{formatVND(bySource.total)}</div>
          <div className="ss">{bySource.sources.length} nguồn · nhanh.vn</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #3B82F6" }}>
          <div className="sl">ĐƠN HÀNG</div>
          <div className="sv">{bySource.sources.reduce((s, src) => s + src.orders, 0).toLocaleString("vi-VN")}</div>
          <div className="ss">Thành công</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #DC2626" }}>
          <div className="sl">CHI PHÍ ADS FB</div>
          <div className="sv" style={{ color: "#DC2626" }}>—</div>
          <div className="ss">Chờ kết nối</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #D97706" }}>
          <div className="sl">ROAS TỔNG</div>
          <div className="sv">—</div>
          <div className="ss">DT / Chi phí Ads</div>
        </div>
      </div>

      {/* ═══ SOURCE BREAKDOWN ═══ */}
      <div className="card" style={{ marginBottom: 12, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Bóc tách doanh thu theo nguồn</div>
          <span style={{ fontSize: 11, color: "#6B7280" }}>{formatVND(bySource.total)} tổng</span>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>NGUỒN</th>
              <th className="text-right">ĐƠN</th>
              <th className="text-right">DOANH THU</th>
              <th className="text-right">%</th>
            </tr></thead>
            <tbody>
              {bySource.sources.map((s) => (
                <tr key={s.name}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td className="text-right">{s.orders.toLocaleString("vi-VN")}</td>
                  <td className="text-right" style={{ color: "#16A34A", fontWeight: 700 }}>{formatVND(s.revenue)}</td>
                  <td className="text-right" style={{ fontWeight: 600 }}>{s.pct.toFixed(1)}%</td>
                </tr>
              ))}
              {bySource.sources.length === 0 && (
                <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 20 }}>Không có data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ DAILY CHART — full width ═══ */}
      {dailyChart.length > 0 && (
        <div className="card" style={{ marginBottom: 12, padding: "14px 16px" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Doanh thu theo ngày</div>
          <div style={{ height: 180 }}>
            <div style={{ display: "flex", alignItems: "flex-end", height: 180, gap: 3, padding: "0 2px" }}>
              {dailyChart.map((d) => {
                const h = (d.revenue / maxRev) * 160;
                const isFuture = d.date > today;
                return (
                  <div key={d.date} style={{
                    flex: 1, minWidth: 0,
                    height: Math.max(h, d.revenue > 0 ? 4 : 0),
                    background: isFuture ? "rgba(99,102,241,0.15)" : BRAND,
                    borderRadius: "3px 3px 0 0",
                    opacity: isFuture ? 0.5 : 0.8,
                  }} />
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 3, padding: "0 2px", borderTop: "1px solid #E5E7EB" }}>
            {dailyChart.map((d, i) => (
              <div key={d.date} style={{ flex: 1, textAlign: "center", fontSize: 10, padding: "5px 0", color: "#6B7280", minWidth: 0 }}>
                {i % labelStep === 0 ? d.date.substring(8) : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ KẾT QUẢ TÀI CHÍNH — simple list like GAS ═══ */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 13 }}>
          Kết quả tài chính
        </div>
        <div style={{ padding: "0 16px" }}>
          {/* Doanh thu Web/App B2B */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F3F4F6", fontWeight: 700 }}>
            <span>Doanh thu Web/App B2B</span>
            <span style={{ color: "#16A34A" }}>{formatVND(bySource.total)}</span>
          </div>
          {bySource.sources.map((s) => (
            <div key={s.name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 8px 20px", borderBottom: "1px solid #F9FAFB", fontSize: 12 }}>
              <span style={{ color: "#374151" }}>{s.name}</span>
              <span>{formatVND(s.revenue)}</span>
            </div>
          ))}

          {/* Chi phí Ads Facebook — placeholder */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F3F4F6", fontWeight: 700, marginTop: 4 }}>
            <span>Chi phí Ads Facebook</span>
            <span style={{ color: "#DC2626" }}>—</span>
          </div>
          <div style={{ padding: "8px 0 8px 20px", fontSize: 12, color: "#9CA3AF", borderBottom: "1px solid #F9FAFB" }}>
            Chờ kết nối FB Ads cho Web/App pages
          </div>

          {/* ROAS */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F3F4F6", fontWeight: 700 }}>
            <span>ROAS tổng</span>
            <span>—</span>
          </div>

          {/* Note */}
          <div style={{ padding: "10px 0", fontSize: 11, color: "#9CA3AF" }}>
            Chưa tính: Giá vốn · Ship · Vận hành
          </div>
        </div>
      </div>
    </section>
  );
}
