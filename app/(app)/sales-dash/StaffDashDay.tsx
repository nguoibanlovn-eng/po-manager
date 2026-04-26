"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { formatVNDCompact } from "@/lib/format";

function daysAgo(d: number): string { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().substring(0, 10); }
function monthRange(offset: number) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth() + offset;
  const first = new Date(y, m, 1); const last = offset === 0 ? now : new Date(y, m + 1, 0);
  const fmt = (d: Date) => d.toISOString().substring(0, 10);
  return { from: fmt(first), to: fmt(last) };
}
const QUICK_RANGES = [
  { key: "today", label: "Hôm nay" },
  { key: "yesterday", label: "Hôm qua" },
  { key: "7d", label: "7N", from: daysAgo(-7), to: daysAgo(0) },
  { key: "14d", label: "14N", from: daysAgo(-14), to: daysAgo(0) },
  { key: "30d", label: "30N", from: daysAgo(-30), to: daysAgo(0) },
  { key: "month", label: "Tháng", ...monthRange(0) },
  { key: "prev", label: "T.trước", ...monthRange(-1) },
  { key: "year", label: "Năm nay", from: `${new Date().getFullYear()}-01-01`, to: daysAgo(0) },
];

export type StaffDashDayProps = {
  channelName: string;
  channelColor: string;
  date: string;
  prevDay: string;
  nextDay: string;
  dayOfWeek: string;
  displayDate: string;
  revenue: number;
  expected: number;
  orders: number;
  revenueYesterday: number;
  dailyTarget: number;
  sources: { name: string; revenue: number; orders: number; expected: number }[];
  adsAccounts: { name: string; spend: number }[];
  adsTotal: number;
  adsPct: number;
  roas: number;
  monthRevenue: number;
  monthTarget: number;
  dayOfMonth: number;
  daysInMonth: number;
};

const pctChange = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);
const statusColor = (pct: number) => pct >= 100 ? "#16A34A" : pct >= 70 ? "#D97706" : pct > 0 ? "#DC2626" : "#94A3B8";

export default function StaffDashDay(p: StaffDashDayProps) {
  const [showAllSources, setShowAllSources] = useState(false);
  const [rangeKey, setRangeKey] = useState("today");
  const [rangeData, setRangeData] = useState<{ revenue: number; sources: typeof p.sources } | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);

  const loadRange = useCallback(async (key: string) => {
    setRangeKey(key);
    if (key === "today") { setRangeData(null); return; }
    if (key === "yesterday") { setRangeData(null); return; } // handled by link
    const range = QUICK_RANGES.find(r => r.key === key);
    if (!range || !("from" in range)) return;
    setRangeLoading(true);
    try {
      const res = await fetch(`/api/dash/channel-range?from=${range.from}&to=${range.to}`);
      const json = await res.json();
      if (json.ok) {
        const channels = json.channels as Array<{ name: string; revenue: number }>;
        // Map channel names: dashboard shows "TikTok" but DB has "TikTok Shop"
        const dbName = p.channelName === "TikTok" ? "TikTok Shop" : p.channelName;
        const ch = channels.find(c => c.name === p.channelName || c.name === dbName);
        const allWebNames = ["API", "Admin", "Website", "App"];
        const webRev = p.channelName === "Web/App" ? channels.filter(c => allWebNames.includes(c.name)).reduce((s: number, c: { revenue: number }) => s + c.revenue, 0) : 0;
        const rev = p.channelName === "Web/App" ? webRev : (ch?.revenue || 0);
        const srcMap = json.sourcesByChannel || {};
        const sources = srcMap[p.channelName] || srcMap[dbName] || [];
        const webSources = p.channelName === "Web/App" ? [...(srcMap["API"] || []), ...(srcMap["Admin"] || []), ...(srcMap["Website"] || [])].sort((a: { revenue: number }, b: { revenue: number }) => b.revenue - a.revenue) : sources;
        setRangeData({ revenue: rev, sources: p.channelName === "Web/App" ? webSources : sources });
      }
    } catch { /* */ }
    setRangeLoading(false);
  }, [p.channelName]);

  const displayRevenue = rangeData?.revenue ?? p.revenue;
  const displaySources = rangeData?.sources ?? p.sources;
  const isRangeMode = rangeKey !== "today" && rangeKey !== "yesterday" && rangeData !== null;

  const revChange = pctChange(p.revenue, p.revenueYesterday);
  const revPct = p.dailyTarget > 0 ? Math.round((p.revenue / p.dailyTarget) * 100) : 0;
  const monthPct = p.monthTarget > 0 ? Math.round((p.monthRevenue / p.monthTarget) * 100) : 0;
  const timePct = p.daysInMonth > 0 ? Math.round((p.dayOfMonth / p.daysInMonth) * 100) : 0;
  const visibleSources = showAllSources ? displaySources : displaySources.slice(0, 3);

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", paddingBottom: 80 }}>
      {/* Loading overlay */}
      {rangeLoading && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 999, background: "#7C3AED", color: "#fff", textAlign: "center", padding: "6px 0", fontSize: 12, fontWeight: 600 }}>
          Đang tải dữ liệu...
        </div>
      )}

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${p.channelColor}, ${p.channelColor}CC)`, padding: "14px 14px 0", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{p.channelName}</div>
            <div style={{ fontSize: 11, opacity: .6 }}>{p.dayOfWeek}, {p.displayDate}</div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <Link href={`/sales-dash?date=${p.prevDay}`} style={{ background: "rgba(255,255,255,.15)", color: "#fff", width: 30, height: 30, borderRadius: 8, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>‹</Link>
            <Link href={`/sales-dash?date=${p.nextDay}`} style={{ background: "rgba(255,255,255,.15)", color: "#fff", width: 30, height: 30, borderRadius: 8, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>›</Link>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
          {QUICK_RANGES.map(r => (
            <button key={r.key} onClick={() => r.key === "today" ? (setRangeKey("today"), setRangeData(null)) : r.key === "yesterday" ? (window.location.href = `/sales-dash?channel=${encodeURIComponent(p.channelName)}&date=${p.prevDay}`) : loadRange(r.key)} style={{
              background: rangeKey === r.key ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.1)",
              color: rangeKey === r.key ? "#fff" : "rgba(255,255,255,.6)",
              padding: "5px 10px", borderRadius: 8, fontSize: 10, fontWeight: 600,
              border: "none", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      {/* KH ngày */}
      {p.dailyTarget > 0 && (
        <div style={{ margin: "0 10px", padding: "8px 12px", background: `linear-gradient(135deg, ${p.channelColor}, ${p.channelColor}CC)`, borderRadius: "0 0 12px 12px", color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, opacity: .5, textTransform: "uppercase" }}>KH ngày {p.channelName}</span>
            <span style={{ fontSize: 13, fontWeight: 800 }}>{formatVNDCompact(p.dailyTarget)}</span>
            <span style={{ fontSize: 9, opacity: .5 }}>{p.revenue >= p.dailyTarget ? "✓ Đạt" : `Còn ${formatVNDCompact(Math.max(0, p.dailyTarget - p.revenue))}`}</span>
          </div>
          <div style={{ height: 3, background: "rgba(255,255,255,.2)", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(revPct, 100)}%`, background: "#4ADE80", borderRadius: 2 }} />
          </div>
        </div>
      )}

      {/* Hero DT */}
      <div style={{ margin: "8px 10px 0", borderRadius: 14, padding: 14, color: "#fff", background: `linear-gradient(135deg, ${revPct >= 100 ? "#059669" : revPct >= 70 ? "#D97706" : "#DC2626"}, ${revPct >= 100 ? "#10B981" : revPct >= 70 ? "#F59E0B" : "#EF4444"})` }}>
        <div style={{ fontSize: 11, opacity: .8 }}>DT THÀNH CÔNG · {p.channelName}{isRangeMode ? ` (${QUICK_RANGES.find(r => r.key === rangeKey)?.label})` : ""}</div>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1 }}>{formatVNDCompact(displayRevenue)}</div>
        <div style={{ fontSize: 11, opacity: .7 }}>{p.orders} đơn · {revChange >= 0 ? "▲" : "▼"} {revChange >= 0 ? "+" : ""}{revChange}% vs hôm qua</div>
        <div style={{ height: 6, background: "rgba(255,255,255,.2)", borderRadius: 3, marginTop: 10, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(revPct, 100)}%`, background: "#fff", borderRadius: 3 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: .7, marginTop: 3 }}>
          <span>{revPct}% KH ngày</span><span>KH: {formatVNDCompact(p.dailyTarget)}</span>
        </div>
      </div>

      {/* Mini KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "8px 10px 0" }}>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>DT Dự kiến</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#D97706", margin: "2px 0" }}>{formatVNDCompact(p.expected)}</div>
          <div style={{ fontSize: 9, color: "#94A3B8" }}>tạo - hoàn hủy</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>Chi phí Ads</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#DC2626", margin: "2px 0" }}>{p.adsTotal > 0 ? formatVNDCompact(p.adsTotal) : "—"}</div>
          <div style={{ fontSize: 9, color: "#94A3B8" }}>{p.adsTotal > 0 ? `${p.adsPct.toFixed(1)}% DT · ROAS ${p.roas.toFixed(1)}x` : "Không có ads"}</div>
        </div>
      </div>

      <div style={{ height: 6, background: "#F1F5F9", marginTop: 10 }} />

      {/* Sub-sources */}
      <div style={{ padding: "12px 10px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>
          {p.channelName === "Facebook" ? "Pages" : p.channelName === "TikTok" || p.channelName === "Shopee" ? "Shops" : "Nguồn"} hôm nay
        </div>
        {visibleSources.map((src, i) => (
          <div key={src.name} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: p.channelColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff" }}>{i + 1}</div>
              <div style={{ fontSize: 13, fontWeight: 700, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{src.name}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: statusColor(100) }}>{formatVNDCompact(src.revenue)}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, background: "#F8FAFC", borderRadius: 8, padding: "6px 8px" }}>
              <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>Đơn</div><div style={{ fontSize: 11, fontWeight: 700 }}>{src.orders}</div></div>
              <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>DK</div><div style={{ fontSize: 11, fontWeight: 700, color: "#D97706" }}>{formatVNDCompact(src.expected)}</div></div>
              <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>% tổng</div><div style={{ fontSize: 11, fontWeight: 700 }}>{p.revenue > 0 ? Math.round(src.revenue / p.revenue * 100) : 0}%</div></div>
            </div>
          </div>
        ))}
        {p.sources.length > 3 && !showAllSources && (
          <div onClick={() => setShowAllSources(true)} style={{ textAlign: "center", padding: 6, fontSize: 10, color: "#3B82F6", fontWeight: 600, cursor: "pointer" }}>+{p.sources.length - 3} nữa ▾</div>
        )}
      </div>

      {/* Ads */}
      {p.adsTotal > 0 && (
        <>
          <div style={{ height: 6, background: "#F1F5F9" }} />
          <div style={{ padding: "12px 10px 0" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>
              Chi phí Ads · {p.channelName} <span style={{ fontSize: 10, fontWeight: 700, background: "#FEF2F2", color: "#DC2626", padding: "1px 6px", borderRadius: 6, textTransform: "none", letterSpacing: 0 }}>{formatVNDCompact(p.adsTotal)}</span>
            </div>
            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div><div style={{ fontSize: 10, color: "#64748B" }}>Tổng</div><div style={{ fontSize: 16, fontWeight: 800, color: "#DC2626" }}>{formatVNDCompact(p.adsTotal)}</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#64748B" }}>% DT</div><div style={{ fontSize: 16, fontWeight: 800, color: p.adsPct <= 5 ? "#16A34A" : p.adsPct <= 7 ? "#D97706" : "#DC2626" }}>{p.adsPct.toFixed(1)}%</div></div>
              <div style={{ textAlign: "right" }}><div style={{ fontSize: 10, color: "#64748B" }}>ROAS</div><div style={{ fontSize: 16, fontWeight: 800, color: p.roas >= 10 ? "#16A34A" : "#D97706" }}>{p.roas.toFixed(1)}x</div></div>
            </div>
            {p.adsAccounts.length > 0 && (
              <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "6px 10px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", marginBottom: 4 }}>Top tài khoản</div>
                {p.adsAccounts.slice(0, 5).map((a, i) => (
                  <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: i < Math.min(p.adsAccounts.length, 5) - 1 ? "1px solid #F8FAFC" : "none", fontSize: 11 }}>
                    <span style={{ width: 14, height: 14, borderRadius: "50%", background: i === 0 ? "#FEF3C7" : "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: i === 0 ? "#D97706" : "#64748B" }}>{i + 1}</span>
                    <span style={{ flex: 1, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
                    <span style={{ fontWeight: 700, color: "#DC2626" }}>{formatVNDCompact(a.spend)}</span>
                    <span style={{ fontSize: 9, color: "#64748B", width: 28, textAlign: "right" }}>{p.adsTotal > 0 ? Math.round(a.spend / p.adsTotal * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ height: 6, background: "#F1F5F9", marginTop: 10 }} />

      {/* Month progress */}
      <div style={{ padding: "12px 10px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Tiến độ tháng · {p.channelName}</div>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div><div style={{ fontSize: 9, color: "#94A3B8" }}>Đạt</div><div style={{ fontSize: 18, fontWeight: 800, color: statusColor(monthPct) }}>{formatVNDCompact(p.monthRevenue)}</div></div>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: "#94A3B8" }}>KH tháng</div><div style={{ fontSize: 18, fontWeight: 800 }}>{formatVNDCompact(p.monthTarget)}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontSize: 9, color: "#94A3B8" }}>Còn</div><div style={{ fontSize: 18, fontWeight: 800, color: "#D97706" }}>{formatVNDCompact(Math.max(0, p.monthTarget - p.monthRevenue))}</div></div>
          </div>
          <div style={{ height: 8, background: "#F3F4F6", borderRadius: 4, overflow: "hidden", position: "relative" }}>
            <div style={{ height: "100%", width: `${Math.min(monthPct, 100)}%`, background: monthPct >= 100 ? "#22C55E" : monthPct >= 70 ? "#3B82F6" : "#F59E0B", borderRadius: 4 }} />
            <div style={{ position: "absolute", top: -1, left: `${timePct}%`, width: 1, height: 10, background: "#DC2626", opacity: .4 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#94A3B8", marginTop: 3 }}>
            <span>{monthPct}% KH · Ngày {p.dayOfMonth}/{p.daysInMonth}</span>
            <span>TB {p.dayOfMonth > 0 ? formatVNDCompact(p.monthRevenue / p.dayOfMonth) : "—"}/ngày</span>
          </div>
        </div>
      </div>
    </div>
  );
}
