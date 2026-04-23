"use client";

import { useState } from "react";
import { formatVNDCompact } from "@/lib/format";
import AutoSyncToday from "../components/AutoSyncToday";

function fmtTy(v: number): string { return (v / 1e9).toFixed(2) + " tỷ"; }

/**
 * Quy tắc màu thống nhất:
 * - Xanh (#16A34A): đạt/vượt KH (≥100%), ads ≤5%
 * - Vàng (#D97706): gần đạt (70-99%), ads 5-7%, đang chạy
 * - Đỏ (#DC2626): chưa đạt (<70%), ads >7%, cảnh báo
 * - Xám (#94A3B8): chưa có data, tương lai
 */
const statusColor = (pct: number) => pct >= 100 ? "#16A34A" : pct >= 70 ? "#D97706" : pct > 0 ? "#DC2626" : "#94A3B8";
const adsColor = (pct: number) => pct <= 0 ? "#94A3B8" : pct <= 5 ? "#16A34A" : pct <= 7 ? "#D97706" : "#DC2626";
const barBg = (pct: number) => pct >= 100 ? "#22C55E" : pct >= 70 ? "#F59E0B" : pct > 0 ? "#EF4444" : "#E2E8F0";

export type DashYearMobileProps = {
  year: number;
  nowMonth: number;
  yearTarget: number;
  cumRevenue: number;
  prevYearRev: number;
  growthVsPrev: number;
  cumAdsTotal: number;
  adsRevPct: number;
  months: { month: string; revenue: number; target: number; ads: number; byChannel: Record<string, number>; channelTargets: Record<string, number> }[];
  channels: { name: string; abbr: string; color: string; rev: number; target: number; ads: number }[];
  sourcesByChannel: Record<string, { name: string; revenue: number; orders: number }[]>;
};

export default function DashYearMobile(p: DashYearMobileProps) {
  const [expandedCh, setExpandedCh] = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const yearPct = p.yearTarget > 0 ? (p.cumRevenue / p.yearTarget * 100) : 0;
  const remaining = Math.max(0, p.yearTarget - p.cumRevenue);
  const maxMonthRev = Math.max(...p.months.map(m => m.revenue), 1);
  const yearStatus = statusColor(Math.round(yearPct));

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", paddingBottom: 80 }}>
      <AutoSyncToday extraSyncs={["/api/tiktok/sync-ads", "/api/tiktok/sync-gmv-max", "/api/fb/sync-ads"]} />

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#7C3AED,#4C1D95)", padding: "14px 14px 16px", color: "#fff" }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Năm {p.year}</div>
        <div style={{ fontSize: 11, opacity: .6 }}>KH: {fmtTy(p.yearTarget)} · {p.year - 1}: {fmtTy(p.prevYearRev)} (+{p.growthVsPrev}%)</div>
      </div>

      {/* Hero — margin-top: 8px to separate from header */}
      <div style={{ margin: "8px 10px 0", borderRadius: 14, padding: 14, color: "#fff", background: `linear-gradient(135deg, ${yearStatus}, ${yearStatus}CC)` }}>
        <div style={{ fontSize: 11, opacity: .8 }}>LŨY KẾ T1–T{p.nowMonth}</div>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1 }}>{fmtTy(p.cumRevenue)}</div>
        <div style={{ fontSize: 11, opacity: .7 }}>KH năm: {fmtTy(p.yearTarget)}</div>
        <div style={{ height: 6, background: "rgba(255,255,255,.2)", borderRadius: 3, marginTop: 10, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(yearPct, 100)}%`, background: "#fff", borderRadius: 3 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: .8, marginTop: 3 }}>
          <span>{yearPct.toFixed(1)}% KH</span><span>Còn {fmtTy(remaining)}</span>
        </div>
      </div>

      {/* Mini KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "8px 10px 0" }}>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>Ads lũy kế</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: adsColor(p.adsRevPct), margin: "2px 0" }}>{fmtTy(p.cumAdsTotal)}</div>
          <div style={{ fontSize: 9, color: adsColor(p.adsRevPct), fontWeight: 600 }}>{p.adsRevPct.toFixed(1)}% / DT · {p.adsRevPct <= 5 ? "Tốt" : p.adsRevPct <= 7 ? "TB" : "Cao"}</div>
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
              const pctKH = m.target > 0 ? Math.round((m.revenue / m.target) * 100) : 0;
              const color = isFuture ? "#E2E8F0" : barBg(pctKH);
              return (
                <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                  {m.revenue > 0 && <div style={{ fontSize: 7, fontWeight: 700, marginBottom: 1, color: isCurrent ? "#7C3AED" : statusColor(pctKH) }}>{(m.revenue / 1e9).toFixed(1)}</div>}
                  <div style={{ width: "80%", height: Math.max(h, 2), background: color, borderRadius: "3px 3px 0 0", border: isFuture ? "1px dashed #D1D5DB" : "none" }} />
                  <div style={{ fontSize: 8, color: isCurrent ? "#7C3AED" : "#94A3B8", fontWeight: isCurrent ? 700 : 400, marginTop: 2 }}>T{mi}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 8, color: "#94A3B8", marginTop: 6, justifyContent: "center" }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#22C55E", marginRight: 3, verticalAlign: "middle" }} />≥100% KH</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#F59E0B", marginRight: 3, verticalAlign: "middle" }} />70-99%</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#EF4444", marginRight: 3, verticalAlign: "middle" }} />&lt;70%</span>
          </div>
        </div>
      </div>

      <div style={{ height: 6, background: "#F1F5F9" }} />

      {/* Channels */}
      <div style={{ padding: "12px 10px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Kênh bán lũy kế</div>

        {p.cumRevenue > 0 && (
          <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 8 }}>
            {p.channels.map(ch => {
              const pct = p.cumRevenue > 0 ? (ch.rev / p.cumRevenue * 100) : 0;
              if (pct < 1) return null;
              return <div key={ch.name} style={{ width: `${pct}%`, background: ch.color, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 12 }}><span style={{ fontSize: 6, color: "#fff", fontWeight: 700 }}>{ch.abbr}</span></div>;
            })}
          </div>
        )}

        {p.channels.map(ch => {
          const pct = ch.target > 0 ? Math.round((ch.rev / ch.target) * 100) : 0;
          const chAdsPct = ch.rev > 0 ? (ch.ads / ch.rev * 100) : 0;
          const isExpanded = expandedCh === ch.name;
          const chKey = ch.name === "Web/App B2B" ? "API" : ch.name;
          const sources = p.sourcesByChannel[chKey] || [];
          const extraSources = ch.name === "Web/App B2B" ? (p.sourcesByChannel["Admin"] || []).filter(s => s.revenue > 0) : [];
          const displaySources = [...sources, ...extraSources].sort((a, b) => b.revenue - a.revenue);

          return (
            <div key={ch.name} style={{ background: "#fff", border: `1px solid ${isExpanded ? ch.color : "#E2E8F0"}`, borderRadius: 12, padding: "10px 12px", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, cursor: "pointer" }} onClick={() => setExpandedCh(isExpanded ? null : ch.name)}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: ch.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff" }}>{ch.abbr}</div>
                <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{ch.name}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: statusColor(pct) }}>{fmtTy(ch.rev)}</div>
                <span style={{ fontSize: 10, color: "#94A3B8", transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform .2s" }}>›</span>
              </div>
              <div style={{ height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden", marginBottom: 3 }}>
                <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: barBg(pct), borderRadius: 3 }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, background: "#F8FAFC", borderRadius: 8, padding: "6px 8px" }}>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>KH năm</div><div style={{ fontSize: 10, fontWeight: 700 }}>{fmtTy(ch.target)}</div></div>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>Đạt</div><div style={{ fontSize: 10, fontWeight: 700, color: statusColor(pct) }}>{pct}%</div></div>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>Ads</div><div style={{ fontSize: 10, fontWeight: 700, color: adsColor(chAdsPct) }}>{ch.ads > 0 ? fmtTy(ch.ads) : "—"}</div></div>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>%Ads</div><div style={{ fontSize: 10, fontWeight: 700, color: adsColor(chAdsPct) }}>{ch.ads > 0 ? `${chAdsPct.toFixed(1)}%` : "—"}</div></div>
              </div>

              {isExpanded && displaySources.length > 0 && (
                <div style={{ marginTop: 8, borderTop: "1px solid #F1F5F9", paddingTop: 6 }}>
                  <div style={{ fontSize: 9, color: "#94A3B8", marginBottom: 4 }}>Chi tiết kênh nhỏ ({displaySources.length})</div>
                  {displaySources.map((src, si) => {
                    const srcPct = ch.rev > 0 ? Math.round(src.revenue / ch.rev * 100) : 0;
                    const barW = displaySources[0]?.revenue > 0 ? Math.round(src.revenue / displaySources[0].revenue * 100) : 0;
                    return (
                      <div key={src.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: si < displaySources.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", width: 14, textAlign: "right" }}>{si + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{src.name}</div>
                          <div style={{ height: 3, background: "#F3F4F6", borderRadius: 2, marginTop: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${barW}%`, background: ch.color, opacity: .6, borderRadius: 2 }} />
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700 }}>{formatVNDCompact(src.revenue)}</div>
                          <div style={{ fontSize: 8, color: "#94A3B8" }}>{srcPct}% · {src.orders} đơn</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ height: 6, background: "#F1F5F9" }} />

      {/* Monthly detail */}
      <div style={{ padding: "12px 10px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Chi tiết từng tháng</div>
        {p.months.map((m, i) => {
          const mi = i + 1;
          const pctKH = m.target > 0 ? Math.round((m.revenue / m.target) * 100) : 0;
          const isFuture = mi > p.nowMonth;
          const isCurrent = mi === p.nowMonth;
          const isExpM = expandedMonth === m.month;
          const adsPctM = m.revenue > 0 ? (m.ads / m.revenue * 100) : 0;
          const CT = { Facebook: "#1877F2", TikTok: "#18181B", Shopee: "#EE4D2D", API: "#6366F1", Admin: "#9CA3AF", facebook: "#1877F2", tiktok: "#18181B", shopee: "#EE4D2D", web_b2b: "#6366F1" } as Record<string, string>;

          return (
            <div key={m.month} style={{ background: isFuture ? "#FAFBFC" : "#fff", border: `1px solid ${isExpM ? "#7C3AED" : isFuture ? "#F1F5F9" : "#E2E8F0"}`, borderRadius: 10, padding: "8px 10px", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setExpandedMonth(isExpM ? null : m.month)}>
                <div style={{ width: 26, fontSize: 11, fontWeight: 700, color: isCurrent ? "#7C3AED" : isFuture ? "#94A3B8" : "#64748B" }}>T{mi}</div>
                <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                  {isFuture
                    ? <div style={{ height: "100%", width: "100%", background: "#E2E8F0", border: "1px dashed #D1D5DB", borderRadius: 3 }} />
                    : <div style={{ height: "100%", width: `${Math.min(pctKH, 100)}%`, background: barBg(pctKH), borderRadius: 3 }} />}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, width: 50, textAlign: "right", color: isFuture ? "#94A3B8" : statusColor(pctKH) }}>
                  {m.revenue > 0 ? formatVNDCompact(m.revenue) : "—"}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, width: 28, textAlign: "right", color: isFuture ? "#94A3B8" : statusColor(pctKH) }}>{pctKH > 0 ? `${pctKH}%` : ""}</div>
                <div style={{ fontSize: 9, fontWeight: 600, width: 50, textAlign: "right", color: isFuture ? "#3B82F6" : "#94A3B8" }}>KH {formatVNDCompact(m.target)}</div>
                <span style={{ fontSize: 10, color: "#94A3B8", transform: isExpM ? "rotate(90deg)" : "none", transition: "transform .2s" }}>›</span>
              </div>

              {/* Expanded: past/current → channel actual vs target */}
              {isExpM && !isFuture && (
                <div style={{ marginTop: 6, borderTop: "1px solid #F1F5F9", paddingTop: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#94A3B8", marginBottom: 4 }}>
                    <span>Kênh</span><span>Thực tế · KH · Đạt%</span>
                  </div>
                  {Object.entries(m.byChannel)
                    .sort(([, a], [, b]) => b - a)
                    .map(([ch, rev]) => {
                      const chTarget = m.channelTargets[ch] || m.channelTargets[({ Facebook: "facebook", TikTok: "tiktok", Shopee: "shopee", API: "web_b2b", Admin: "web_b2b" } as Record<string, string>)[ch] || ""] || 0;
                      const chPct = chTarget > 0 ? Math.round(rev / chTarget * 100) : 0;
                      return (
                        <div key={ch} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderBottom: "1px solid #F8FAFC" }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: CT[ch] || "#94A3B8", flexShrink: 0 }} />
                          <span style={{ fontSize: 10, fontWeight: 600, flex: 1 }}>{ch}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: statusColor(chPct) }}>{formatVNDCompact(rev)}</span>
                          <span style={{ fontSize: 9, color: "#94A3B8" }}>/ {formatVNDCompact(chTarget)}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: statusColor(chPct), width: 28, textAlign: "right" }}>{chPct > 0 ? `${chPct}%` : ""}</span>
                          <div style={{ width: 30, height: 3, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(chPct, 100)}%`, background: barBg(chPct), borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                  {m.ads > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderTop: "1px solid #F8FAFC", marginTop: 2 }}>
                      <span style={{ width: 8, height: 2, background: "#DC2626", flexShrink: 0 }} />
                      <span style={{ fontSize: 10, fontWeight: 600, flex: 1, color: adsColor(adsPctM) }}>Ads</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: adsColor(adsPctM) }}>{formatVNDCompact(m.ads)}</span>
                      <span style={{ fontSize: 9, color: adsColor(adsPctM) }}>{adsPctM.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              )}

              {/* Expanded: future → target allocation per channel */}
              {isExpM && isFuture && (
                <div style={{ marginTop: 6, borderTop: "1px solid #F1F5F9", paddingTop: 6 }}>
                  <div style={{ fontSize: 9, color: "#94A3B8", marginBottom: 4 }}>Phân bổ KH tháng {mi}</div>
                  {Object.entries(m.channelTargets)
                    .filter(([, v]) => v > 0)
                    .sort(([, a], [, b]) => b - a)
                    .map(([ch, target]) => {
                      const pctOfTotal = m.target > 0 ? Math.round(target / m.target * 100) : 0;
                      const label = ({ facebook: "Facebook", tiktok: "TikTok", shopee: "Shopee", web_b2b: "Web/App" } as Record<string, string>)[ch] || ch;
                      return (
                        <div key={ch} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: CT[ch] || "#94A3B8", flexShrink: 0 }} />
                          <span style={{ fontSize: 10, fontWeight: 600, flex: 1 }}>{label}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#3B82F6" }}>{formatVNDCompact(target)}</span>
                          <span style={{ fontSize: 9, color: "#94A3B8", width: 28, textAlign: "right" }}>{pctOfTotal}%</span>
                        </div>
                      );
                    })}
                  <div style={{ padding: "5px 8px", background: "#EFF6FF", borderRadius: 6, marginTop: 6, fontSize: 9, color: "#1E40AF" }}>
                    TB ngày: <strong>{formatVNDCompact(m.target / new Date(Number(m.month.substring(0, 4)), Number(m.month.substring(5, 7)), 0).getDate())}/ngày</strong> · {new Date(Number(m.month.substring(0, 4)), Number(m.month.substring(5, 7)), 0).getDate()} ngày
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
