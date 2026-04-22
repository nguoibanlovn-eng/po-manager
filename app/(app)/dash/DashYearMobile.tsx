"use client";

import { formatVNDCompact } from "@/lib/format";
import AutoSyncToday from "../components/AutoSyncToday";

function fmtTy(v: number): string { return (v / 1e9).toFixed(2) + " tỷ"; }

export type DashYearMobileProps = {
  year: number;
  nowMonth: number;
  yearTarget: number;
  cumRevenue: number;
  prevYearRev: number;
  growthVsPrev: number;
  cumAdsTotal: number;
  adsRevPct: number;
  months: { month: string; revenue: number; target: number; ads: number }[];
  channels: { name: string; abbr: string; color: string; rev: number; target: number }[];
};

export default function DashYearMobile(p: DashYearMobileProps) {
  const yearPct = p.yearTarget > 0 ? (p.cumRevenue / p.yearTarget * 100) : 0;
  const remaining = Math.max(0, p.yearTarget - p.cumRevenue);
  const maxMonthRev = Math.max(...p.months.map(m => m.revenue), 1);

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", paddingBottom: 80 }}>
      <AutoSyncToday />

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#7C3AED,#4C1D95)", padding: "12px 14px", color: "#fff" }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Năm {p.year}</div>
        <div style={{ fontSize: 11, opacity: .6 }}>KH: {fmtTy(p.yearTarget)} · {p.year - 1}: {fmtTy(p.prevYearRev)} (+{p.growthVsPrev}%)</div>
      </div>

      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg,#7C3AED,#4C1D95)", margin: "0 10px", borderRadius: 14, padding: 14, color: "#fff", marginTop: -1 }}>
        <div style={{ fontSize: 11, opacity: .8 }}>LŨY KẾ T1–T{p.nowMonth}</div>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1 }}>{fmtTy(p.cumRevenue)}</div>
        <div style={{ fontSize: 11, opacity: .7 }}>KH năm {fmtTy(p.yearTarget)}</div>
        <div style={{ height: 6, background: "rgba(255,255,255,.2)", borderRadius: 3, marginTop: 10, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(yearPct, 100)}%`, background: "#fff", borderRadius: 3 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: .7, marginTop: 3 }}>
          <span>{yearPct.toFixed(1)}% KH</span><span>Còn {fmtTy(remaining)}</span>
        </div>
      </div>

      {/* Mini KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "8px 10px 0" }}>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>Ads lũy kế</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#DC2626", margin: "2px 0" }}>{fmtTy(p.cumAdsTotal)}</div>
          <div style={{ fontSize: 9, color: "#94A3B8" }}>{p.adsRevPct.toFixed(1)}% / DT tổng</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>Ngân sách nhập</div>
          <div style={{ fontSize: 20, fontWeight: 800, margin: "2px 0" }}>{fmtTy(p.yearTarget * 0.55)}</div>
          <div style={{ fontSize: 9, color: "#94A3B8" }}>55% KH DT</div>
        </div>
      </div>

      {/* Monthly bars */}
      <div style={{ padding: "12px 10px 0" }}>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Doanh thu từng tháng</div>
          <div style={{ display: "flex", alignItems: "flex-end", height: 80, gap: 4 }}>
            {p.months.map((m, i) => {
              const mi = i + 1;
              const h = m.revenue > 0 ? (m.revenue / maxMonthRev * 70) : 8;
              const isCurrent = mi === p.nowMonth;
              const isFuture = mi > p.nowMonth;
              return (
                <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                  {m.revenue > 0 && <div style={{ fontSize: 7, fontWeight: 700, marginBottom: 1, color: isCurrent ? "#7C3AED" : "#374151" }}>{(m.revenue / 1e9).toFixed(1)}</div>}
                  <div style={{ width: "80%", height: Math.max(h, 2), background: isFuture ? "#E2E8F0" : isCurrent ? "#8B5CF6" : "#C4B5FD", borderRadius: "3px 3px 0 0", border: isFuture ? "1px dashed #D1D5DB" : "none" }} />
                  <div style={{ fontSize: 8, color: isCurrent ? "#7C3AED" : "#94A3B8", fontWeight: isCurrent ? 700 : 400, marginTop: 2 }}>T{mi}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ height: 6, background: "#F1F5F9" }} />

      {/* Channels */}
      <div style={{ padding: "12px 10px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Kênh bán lũy kế</div>
        {p.channels.map(ch => {
          const pct = ch.target > 0 ? Math.round((ch.rev / ch.target) * 100) : 0;
          return (
            <div key={ch.name} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: ch.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff" }}>{ch.abbr}</div>
                <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{ch.name}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: ch.color }}>{fmtTy(ch.rev)}</div>
              </div>
              <div style={{ height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden", marginBottom: 3 }}>
                <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: ch.color, borderRadius: 3 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94A3B8" }}>
                <span>KH năm {fmtTy(ch.target)}</span>
                <span style={{ fontWeight: 700, color: pct >= 30 ? "#16A34A" : "#D97706" }}>{pct}%</span>
              </div>
            </div>
          );
        })}

        {/* Proportion bar */}
        {p.cumRevenue > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden" }}>
              {p.channels.map(ch => {
                const pct = p.cumRevenue > 0 ? (ch.rev / p.cumRevenue * 100) : 0;
                if (pct < 1) return null;
                return <div key={ch.name} style={{ width: `${pct}%`, background: ch.color, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 16 }}><span style={{ fontSize: 7, color: "#fff", fontWeight: 700 }}>{ch.abbr}</span></div>;
              })}
            </div>
            <div style={{ fontSize: 8, color: "#94A3B8", textAlign: "center", marginTop: 2 }}>Tỉ trọng kênh / tổng DT</div>
          </div>
        )}
      </div>

      <div style={{ height: 6, background: "#F1F5F9" }} />

      {/* Monthly detail list */}
      <div style={{ padding: "12px 10px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Chi tiết từng tháng</div>
        {p.months.map((m, i) => {
          const mi = i + 1;
          const pctKH = m.target > 0 ? Math.round((m.revenue / m.target) * 100) : 0;
          const adsPct = m.revenue > 0 ? (m.ads / m.revenue * 100) : 0;
          const isFuture = mi > p.nowMonth;
          return (
            <div key={m.month} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, padding: "8px 10px", marginBottom: 4, opacity: isFuture ? .5 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 26, fontSize: 11, fontWeight: 700, color: mi === p.nowMonth ? "#7C3AED" : "#64748B" }}>T{mi}</div>
                <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(pctKH, 100)}%`, background: pctKH >= 100 ? "#22C55E" : pctKH >= 70 ? "#3B82F6" : pctKH > 0 ? "#F59E0B" : "#E2E8F0", borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, width: 55, textAlign: "right", color: m.revenue > 0 ? "#374151" : "#D1D5DB" }}>{m.revenue > 0 ? formatVNDCompact(m.revenue) : formatVNDCompact(m.target)}</div>
                <div style={{ fontSize: 9, fontWeight: 700, width: 32, textAlign: "right", color: pctKH >= 100 ? "#16A34A" : pctKH >= 70 ? "#3B82F6" : pctKH > 0 ? "#D97706" : "#D1D5DB" }}>{pctKH > 0 ? `${pctKH}%` : ""}</div>
                <div style={{ fontSize: 9, width: 35, textAlign: "right", color: "#DC2626" }}>{m.ads > 0 ? formatVNDCompact(m.ads) : "—"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
