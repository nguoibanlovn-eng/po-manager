"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatVND, formatVNDCompact, toNum } from "@/lib/format";
import type { SalesSyncRow } from "@/lib/db/webapp";
import TargetProgressBar from "../components/TargetProgressBar";

const BRAND = "#6366F1"; // Indigo for Web/App

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

  // By source
  const bySource = useMemo(() => {
    const m = new Map<string, { orders: number; revenue: number }>();
    for (const r of rows) {
      const src = r.source || r.channel || "Khác";
      const cur = m.get(src) || { orders: 0, revenue: 0 };
      cur.orders += toNum(r.order_net);
      cur.revenue += toNum(r.revenue_net);
      m.set(src, cur);
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v, pct: totals.revenue > 0 ? (v.revenue / totals.revenue) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [rows, totals.revenue]);

  // By date for chart
  const dailyChart = useMemo(() => {
    const m = new Map<string, { revenue: number; orders: number }>();
    for (const r of rows) {
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
  const avgRevPerDay = dailyChart.length > 0 ? totals.revenue / dailyChart.length : 0;
  const aov = totals.orders > 0 ? totals.revenue / totals.orders : 0;
  const sources = bySource.length;
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
          <div className="sv" style={{ color: "#16A34A" }}>{formatVND(totals.revenue)}</div>
          <div className="ss">{sources} nguồn · nhanh.vn</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #3B82F6" }}>
          <div className="sl">ĐƠN HÀNG</div>
          <div className="sv">{totals.orders.toLocaleString("vi-VN")}</div>
          <div className="ss">TB {formatVNDCompact(avgRevPerDay)}/ngày</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #D97706" }}>
          <div className="sl">AOV (TB/ĐƠN)</div>
          <div className="sv">{formatVNDCompact(aov)}</div>
          <div className="ss">{dailyChart.length} ngày có data</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #7C3AED" }}>
          <div className="sl">NGUỒN LỚN NHẤT</div>
          <div className="sv" style={{ fontSize: 14 }}>{bySource[0]?.name || "—"}</div>
          <div className="ss">{bySource[0] ? `${bySource[0].pct.toFixed(1)}% · ${formatVNDCompact(bySource[0].revenue)}` : ""}</div>
        </div>
      </div>

      {/* ═══ 2-COLUMN: Source breakdown + Chart ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>

        {/* Source breakdown */}
        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Bóc tách doanh thu theo nguồn</div>
            <span style={{ fontSize: 10, color: "#6B7280" }}>{formatVND(totals.revenue)} tổng</span>
          </div>
          {bySource.map((s) => (
            <div key={s.name} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{s.name}</span>
                <div style={{ display: "flex", gap: 12, fontSize: 10 }}>
                  <span style={{ color: "#6B7280" }}>{s.orders} đơn</span>
                  <span style={{ fontWeight: 700, color: "#16A34A" }}>{formatVNDCompact(s.revenue)}</span>
                  <span style={{ fontWeight: 600, color: BRAND, width: 36, textAlign: "right" }}>{s.pct.toFixed(1)}%</span>
                </div>
              </div>
              <div style={{ height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(s.pct, 100)}%`, background: BRAND, borderRadius: 3, opacity: 0.7 }} />
              </div>
            </div>
          ))}
          {bySource.length === 0 && <div className="muted" style={{ padding: 20, textAlign: "center" }}>Không có data.</div>}
        </div>

        {/* Daily chart */}
        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Doanh thu theo ngày</div>
          {dailyChart.length > 0 ? (
            <div>
              <div style={{ position: "relative", height: 170 }}>
                <div style={{ display: "flex", alignItems: "flex-end", height: 170, gap: 3, padding: "0 2px" }}>
                  {dailyChart.map((d) => {
                    const h = (d.revenue / maxRev) * 150;
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
                  <div key={d.date} style={{ flex: 1, textAlign: "center", fontSize: 9, padding: "4px 0", color: "#6B7280", minWidth: 0 }}>
                    {i % labelStep === 0 ? d.date.substring(8) : ""}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 1, marginTop: 8, borderRadius: 8, overflow: "hidden", fontSize: 10 }}>
                <div style={{ flex: 1, padding: "8px 10px", background: "#EEF2FF" }}>
                  <div style={{ color: "#6B7280", fontSize: 8 }}>Tổng DT</div>
                  <div style={{ fontWeight: 800, color: BRAND }}>{formatVNDCompact(totals.revenue)}</div>
                </div>
                <div style={{ flex: 1, padding: "8px 10px", background: "#F9FAFB" }}>
                  <div style={{ color: "#6B7280", fontSize: 8 }}>TB/ngày</div>
                  <div style={{ fontWeight: 800 }}>{formatVNDCompact(avgRevPerDay)}</div>
                </div>
                <div style={{ flex: 1, padding: "8px 10px", background: "#F9FAFB" }}>
                  <div style={{ color: "#6B7280", fontSize: 8 }}>Đơn</div>
                  <div style={{ fontWeight: 800 }}>{totals.orders.toLocaleString("vi-VN")}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="muted" style={{ padding: 40, textAlign: "center" }}>Không có data.</div>
          )}
        </div>
      </div>

      {/* ═══ DETAIL TABLE ═══ */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 12 }}>Chi tiết theo nguồn &amp; ngày</span>
          <span className="muted" style={{ fontSize: 10 }}>{rows.length} bản ghi</span>
        </div>
        <div className="tbl-wrap" style={{ maxHeight: 400, overflowY: "auto" }}>
          <table>
            <thead><tr>
              <th>Nguồn</th>
              <th>Channel</th>
              <th>Ngày</th>
              <th className="text-right">Đơn</th>
              <th className="text-right">Doanh thu</th>
              <th className="text-right">AOV</th>
            </tr></thead>
            <tbody>
              {rows.slice(0, 300).map((r) => {
                const rev = toNum(r.revenue_net);
                const ord = toNum(r.order_net);
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{r.source || "—"}</td>
                    <td className="muted" style={{ fontSize: 11 }}>{r.channel}</td>
                    <td className="muted" style={{ fontSize: 11 }}>{String(r.period_from || "").substring(0, 10)}</td>
                    <td className="text-right">{ord}</td>
                    <td className="text-right font-bold" style={{ color: rev >= 0 ? "#16A34A" : "#DC2626" }}>{formatVND(rev)}</td>
                    <td className="text-right muted">{ord > 0 ? formatVNDCompact(rev / ord) : "—"}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có data cho khoảng này.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
