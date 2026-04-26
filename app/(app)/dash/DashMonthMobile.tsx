"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatVNDCompact } from "@/lib/format";
import AutoSyncToday from "../components/AutoSyncToday";

const CH_COLORS: Record<string, string> = { Facebook: "#1877F2", TikTok: "#18181B", Shopee: "#EE4D2D", API: "#6366F1", Admin: "#9CA3AF" };

export type DashMonthMobileProps = {
  month: string;
  lastDay: number;
  dayOfMonth: number;
  revTotal: number;
  revOrders: number;
  revExpected: number;
  totalTarget: number;
  totalAdSpend: number;
  adsPct: number;
  roas: number;
  channels: { name: string; color: string; rev: number; target: number; ads: number }[];
  daily: { date: string; revenue: number }[];
  dailyByChannel: Record<string, number | string>[];
  dailyAds: { date: string; spend: number }[];
  sourcesByChannel: Record<string, { name: string; revenue: number; orders: number; expected: number }[]>;
  outstanding: number;
  damageItems: number;
  damageValue: number;
};

function daysAgo(d: number): string { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().substring(0, 10); }
function monthRange(offset: number) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth() + offset;
  const first = new Date(y, m, 1); const last = offset === 0 ? now : new Date(y, m + 1, 0);
  const fmt = (d: Date) => d.toISOString().substring(0, 10);
  return { from: fmt(first), to: fmt(last) };
}
const CH_RANGES = [
  { key: "month", label: "Tháng này", ...monthRange(0) },
  { key: "prev", label: "Tháng trước", ...monthRange(-1) },
];

export default function DashMonthMobile(p: DashMonthMobileProps) {
  const [touchIdx, setTouchIdx] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const [expandedCh, setExpandedCh] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chRange, setChRange] = useState("month");
  const [chData, setChData] = useState<{ name: string; color: string; rev: number; target: number; ads: number }[] | null>(null);
  const [chSources, setChSources] = useState<Record<string, { name: string; revenue: number; orders: number; expected: number }[]> | null>(null);
  const [chLoading, setChLoading] = useState(false);

  async function loadChRange(key: string) {
    setChRange(key);
    if (key === "month") { setChData(null); setChSources(null); return; }
    const range = CH_RANGES.find(r => r.key === key);
    if (!range) return;
    setChLoading(true);
    try {
      const res = await fetch(`/api/dash/channel-range?from=${range.from}&to=${range.to}`);
      const json = await res.json();
      if (json.ok) {
        setChData(json.channels.map((ch: { name: string; revenue: number }) => ({
          name: ch.name, color: CH_COLORS[ch.name] || "#94A3B8",
          rev: ch.revenue, target: 0, ads: 0,
        })));
        setChSources(json.sourcesByChannel || {});
      }
    } catch { /* */ }
    setChLoading(false);
  }

  const displayChannels = chData || p.channels;
  const displaySources: Record<string, Array<{name: string; revenue: number; orders: number; expected: number}>> = chSources || p.sourcesByChannel;
  const barCount = p.dailyByChannel.length;

  const getIdx = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect || barCount === 0) return -1;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(Math.floor(((clientX - rect.left) / rect.width) * barCount), barCount - 1));
  }, [barCount]);

  // Tap = pin/unpin tooltip
  const handleTap = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const idx = getIdx(e);
    if (idx < 0) return;
    if (pinned && touchIdx === idx) { setPinned(false); setTouchIdx(null); }
    else { setPinned(true); setTouchIdx(idx); }
  }, [getIdx, pinned, touchIdx]);

  // Drag = move only if not pinned (desktop hover)
  const handleMove = useCallback((e: React.MouseEvent) => {
    if (pinned) return;
    const idx = getIdx(e);
    if (idx >= 0) setTouchIdx(idx);
  }, [getIdx, pinned]);

  const timePct = p.lastDay > 0 ? Math.round((p.dayOfMonth / p.lastDay) * 100) : 0;
  const revPct = p.totalTarget > 0 ? Math.round((p.revTotal / p.totalTarget) * 100) : 0;
  const avgDaily = p.dayOfMonth > 0 ? p.revTotal / p.dayOfMonth : 0;
  const projected = avgDaily * p.lastDay;
  const projPct = p.totalTarget > 0 ? Math.round((projected / p.totalTarget) * 100) : 0;
  const max7d = Math.max(...p.daily.map(d => d.revenue), 1);
  const [, mm] = p.month.split("-");

  // Total from range data
  const rangeTotal = chData ? chData.reduce((s, c) => s + c.rev, 0) : 0;

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", paddingBottom: 80 }}>
      <AutoSyncToday extraSyncs={["/api/tiktok/sync-ads", "/api/tiktok/sync-gmv-max", "/api/fb/sync-ads"]} />

      {/* Loading banner */}
      {chLoading && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 999, background: "#7C3AED", color: "#fff", textAlign: "center", padding: "6px 0", fontSize: 12, fontWeight: 600 }}>
          Đang tải dữ liệu...
        </div>
      )}

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#3B82F6,#1D4ED8)", padding: "12px 14px 0", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Tháng {mm}/{p.month.substring(0, 4)}</div>
            <div style={{ fontSize: 11, opacity: .6 }}>Ngày {p.dayOfMonth}/{p.lastDay} · {timePct}% thời gian</div>
          </div>
          <Link href={`/dash?view=month&month=${p.month}`} style={{ background: "rgba(255,255,255,.15)", padding: "3px 10px", borderRadius: 10, fontSize: 10, color: "#fff", textDecoration: "none" }}>⟳</Link>
        </div>
      </div>

      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg,#3B82F6,#1D4ED8)", margin: "0 10px", borderRadius: 14, padding: 14, color: "#fff", marginTop: -1 }}>
        <div style={{ fontSize: 11, opacity: .8 }}>DOANH THU THÁNG</div>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1 }}>{formatVNDCompact(p.revTotal)}</div>
        <div style={{ fontSize: 11, opacity: .7 }}>{p.revOrders.toLocaleString("vi-VN")} đơn · TB {formatVNDCompact(avgDaily)}/ngày</div>
        <div style={{ height: 6, background: "rgba(255,255,255,.2)", borderRadius: 3, marginTop: 10, overflow: "hidden", position: "relative" }}>
          <div style={{ height: "100%", width: `${Math.min(revPct, 100)}%`, background: "#fff", borderRadius: 3 }} />
          <div style={{ position: "absolute", top: -2, left: `${timePct}%`, width: 2, height: 10, background: "rgba(255,255,255,.5)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: .7, marginTop: 3 }}>
          <span>{revPct}% KH</span><span>KH: {formatVNDCompact(p.totalTarget)}</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 10, opacity: .7 }}>
          <span>Còn {formatVNDCompact(Math.max(0, p.totalTarget - p.revTotal))}</span>
          <span>·</span>
          <span>Dự kiến {formatVNDCompact(projected)} ({projPct}%)</span>
        </div>
      </div>

      {/* Mini KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "8px 10px 0" }}>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>DT Dự kiến</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#D97706", margin: "2px 0" }}>{formatVNDCompact(p.revExpected)}</div>
          <div style={{ fontSize: 9, color: "#94A3B8" }}>tạo - hoàn hủy tháng</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>Chi phí Ads</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#DC2626", margin: "2px 0" }}>{formatVNDCompact(p.totalAdSpend)}</div>
          <div style={{ fontSize: 9, color: "#94A3B8" }}>{p.adsPct.toFixed(1)}% DT · ROAS {p.roas.toFixed(1)}x</div>
        </div>
      </div>

      {/* Channels vs KH */}
      <div style={{ padding: "12px 10px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: .5 }}>DT theo kênh{chRange !== "month" ? ` (${CH_RANGES.find(r => r.key === chRange)?.label})` : ""}</div>
          {chLoading && <span style={{ fontSize: 10, color: "#7C3AED", fontWeight: 600, animation: "pulse 1s infinite" }}>Đang tải...</span>}
        </div>
        <div style={{ display: "flex", gap: 4, marginBottom: 10, overflowX: "auto", paddingBottom: 2 }}>
          {CH_RANGES.map(r => (
            <button key={r.key} onClick={() => loadChRange(r.key)} style={{
              padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer",
              border: chRange === r.key ? "1.5px solid #7C3AED" : "1px solid #E2E8F0",
              background: chRange === r.key ? "#F3E8FF" : "#fff",
              color: chRange === r.key ? "#7C3AED" : "#64748B",
              whiteSpace: "nowrap", fontFamily: "inherit",
            }}>{r.label}</button>
          ))}
        </div>
        {/* Range total */}
        {chRange !== "month" && chData && (
          <div style={{ background: "#F3E8FF", borderRadius: 10, padding: "8px 12px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#7C3AED" }}>Tổng DT ({CH_RANGES.find(r => r.key === chRange)?.label})</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#7C3AED" }}>{formatVNDCompact(rangeTotal)}</span>
          </div>
        )}

        {displayChannels.map(ch => {
          const hasTarget = ch.target > 0;
          const pct = hasTarget ? Math.round((ch.rev / ch.target) * 100) : 0;
          const chAdsPct = ch.rev > 0 ? (ch.ads / ch.rev * 100) : 0;
          const isExpanded = expandedCh === ch.name;
          const sources = displaySources[ch.name] || displaySources[ch.name === "Web/App" ? "API" : ""] || [];
          const webSources = ch.name === "Web/App" ? [...sources, ...(displaySources["Admin"] || []).filter(s => s.revenue > 0)] : sources;
          const finalSources = ch.name === "Web/App" ? webSources.sort((a, b) => b.revenue - a.revenue) : sources;
          // % of total for range mode
          const pctOfTotal = rangeTotal > 0 ? Math.round((ch.rev / rangeTotal) * 100) : 0;

          return (
            <div key={ch.name} style={{ background: "#fff", border: `1px solid ${isExpanded ? ch.color : "#E2E8F0"}`, borderRadius: 12, padding: "10px 12px", marginBottom: 6, transition: "border-color .2s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, cursor: "pointer" }} onClick={() => setExpandedCh(isExpanded ? null : ch.name)}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: ch.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff" }}>{ch.name[0]}</div>
                <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{ch.name}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: ch.color }}>{formatVNDCompact(ch.rev)}</div>
                <span style={{ fontSize: 10, color: "#94A3B8", transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform .2s" }}>›</span>
              </div>
              {/* Progress bar — show target progress or % of total */}
              {hasTarget ? (
                <div style={{ height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden", marginBottom: 3, position: "relative" }}>
                  <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? "#22C55E" : pct >= 70 ? ch.color : "#F59E0B", borderRadius: 3 }} />
                  <div style={{ position: "absolute", top: -1, left: `${timePct}%`, width: 1, height: 8, background: "#DC2626", opacity: .4 }} />
                </div>
              ) : (
                <div style={{ height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden", marginBottom: 3 }}>
                  <div style={{ height: "100%", width: `${pctOfTotal}%`, background: ch.color, borderRadius: 3, opacity: .7 }} />
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: hasTarget ? "1fr 1fr 1fr 1fr" : "1fr 1fr", gap: 4, background: "#F8FAFC", borderRadius: 8, padding: "6px 8px", marginTop: 4 }}>
                {hasTarget ? (<>
                  <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>KH</div><div style={{ fontSize: 10, fontWeight: 700 }}>{formatVNDCompact(ch.target)}</div></div>
                  <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>Đạt</div><div style={{ fontSize: 10, fontWeight: 700, color: pct >= 100 ? "#16A34A" : pct >= 70 ? "#374151" : "#D97706" }}>{pct}%</div></div>
                  <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>Ads</div><div style={{ fontSize: 10, fontWeight: 700, color: "#DC2626" }}>{ch.ads > 0 ? formatVNDCompact(ch.ads) : "—"}</div></div>
                  <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>%Ads</div><div style={{ fontSize: 10, fontWeight: 700, color: chAdsPct <= 5 ? "#16A34A" : chAdsPct <= 7 ? "#D97706" : ch.ads > 0 ? "#DC2626" : "#94A3B8" }}>{ch.ads > 0 ? `${chAdsPct.toFixed(1)}%` : "—"}</div></div>
                </>) : (<>
                  <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>% tổng</div><div style={{ fontSize: 10, fontWeight: 700 }}>{pctOfTotal}%</div></div>
                  <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>Doanh thu</div><div style={{ fontSize: 10, fontWeight: 700, color: ch.color }}>{formatVNDCompact(ch.rev)}</div></div>
                </>)}
              </div>

              {/* Expanded: source detail */}
              {isExpanded && finalSources.length > 0 && (
                <div style={{ marginTop: 8, borderTop: "1px solid #F1F5F9", paddingTop: 6 }}>
                  <div style={{ fontSize: 9, color: "#94A3B8", marginBottom: 4 }}>Chi tiết kênh nhỏ ({finalSources.length})</div>
                  {finalSources.map((src, si) => {
                    const srcPct = ch.rev > 0 ? Math.round(src.revenue / ch.rev * 100) : 0;
                    const barW = finalSources[0]?.revenue > 0 ? Math.round(src.revenue / finalSources[0].revenue * 100) : 0;
                    return (
                      <div key={src.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: si < finalSources.length - 1 ? "1px solid #F8FAFC" : "none" }}>
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

      {/* Daily stacked chart + ads */}
      <div style={{ padding: "12px 10px" }}>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Doanh thu + Ads theo ngày</div>
            <div style={{ display: "flex", gap: 8, fontSize: 8, color: "#94A3B8" }}>
              {Object.entries(CH_COLORS).filter(([k]) => p.dailyByChannel.some(d => Number(d[k] || 0) > 0)).map(([k, c]) => (
                <span key={k} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />{k.substring(0, 2)}
                </span>
              ))}
              <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <span style={{ width: 8, height: 2, background: "#DC2626" }} />Ads
              </span>
            </div>
          </div>

          {/* Touch tooltip — pinned or hover */}
          {touchIdx !== null && p.dailyByChannel[touchIdx] && (() => {
            const d = p.dailyByChannel[touchIdx];
            const date = String(d.date);
            const total = Number(d.total || 0);
            const adsDay = p.dailyAds.find(a => a.date === date);
            const adsSpend = adsDay?.spend || 0;
            const adsPctDay = total > 0 ? (adsSpend / total * 100) : 0;
            return (
              <div style={{ background: "#1F2937", color: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 10, marginBottom: 6, position: "relative" }}>
                {pinned && <button onClick={() => { setPinned(false); setTouchIdx(null); }} style={{ position: "absolute", top: 4, right: 6, background: "none", border: "none", color: "#94A3B8", fontSize: 14, cursor: "pointer", lineHeight: 1 }}>✕</button>}
                <div style={{ fontWeight: 700, color: "#D1D5DB", marginBottom: 3 }}>{date} {pinned && <span style={{ fontSize: 8, color: "#6B7280" }}>· bấm ✕ để đóng</span>}</div>
                <div>DT: <strong>{formatVNDCompact(total)}</strong></div>
                {Object.entries(CH_COLORS).map(([ch, c]) => {
                  const v = Number(d[ch] || 0);
                  if (v <= 0) return null;
                  const pct = total > 0 ? Math.round(v / total * 100) : 0;
                  return <div key={ch} style={{ color: c === "#18181B" ? "#fff" : c }}>  {ch}: {formatVNDCompact(v)} ({pct}%)</div>;
                })}
                <div style={{ color: "#F87171", marginTop: 2 }}>Ads: {formatVNDCompact(adsSpend)} ({adsPctDay.toFixed(1)}%)</div>
              </div>
            );
          })()}

          {/* Stacked bars */}
          <div
            ref={chartRef}
            style={{ display: "flex", alignItems: "flex-end", height: 80, gap: 1, position: "relative", touchAction: "none" }}
            onTouchStart={handleTap}
            onMouseMove={handleMove}
            onMouseLeave={() => { if (!pinned) setTouchIdx(null); }}
            onClick={handleTap}
          >
            {p.dailyByChannel.map((d, i) => {
              const total = Number(d.total || 0);
              const h = max7d > 0 ? (total / max7d) * 70 : 0;
              const adsDay = p.dailyAds.find(a => a.date === String(d.date));
              const adsH = adsDay && max7d > 0 ? (adsDay.spend / max7d) * 70 : 0;
              const channels = Object.entries(CH_COLORS).map(([ch, c]) => ({ ch, c, v: Number(d[ch] || 0) })).filter(x => x.v > 0);
              const isActive = touchIdx === i;

              return (
                <div key={String(d.date)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", cursor: "default" }}>
                  {/* Stacked bar */}
                  <div style={{ width: "85%", height: Math.max(h, 2), display: "flex", flexDirection: "column-reverse", borderRadius: "2px 2px 0 0", overflow: "hidden", opacity: isActive ? 1 : .8 }}>
                    {channels.map(({ ch, c, v }) => {
                      const segH = total > 0 ? (v / total) * Math.max(h, 2) : 0;
                      return <div key={ch} style={{ width: "100%", height: segH, background: c }} />;
                    })}
                  </div>
                  {/* Ads dot */}
                  {adsH > 2 && (
                    <div style={{ position: "absolute", bottom: adsH, left: `${(i + 0.5) / p.dailyByChannel.length * 100}%`, width: 4, height: 4, borderRadius: "50%", background: "#DC2626", transform: "translateX(-50%)", zIndex: 2 }} />
                  )}
                </div>
              );
            })}
            {/* Ads line */}
            {p.dailyByChannel.length > 1 && (() => {
              const pts = p.dailyByChannel.map((d, i) => {
                const adsDay = p.dailyAds.find(a => a.date === String(d.date));
                const adsV = adsDay?.spend || 0;
                const x = (i + 0.5) / p.dailyByChannel.length * 100;
                const y = max7d > 0 ? 80 - (adsV / max7d * 70) : 78;
                return `${x},${y}`;
              });
              return (
                <svg viewBox={`0 0 100 80`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1, overflow: "visible" }}>
                  <polyline fill="none" stroke="#DC2626" strokeWidth=".5" strokeDasharray="2 1" points={pts.join(" ")} vectorEffect="non-scaling-stroke" />
                </svg>
              );
            })()}
          </div>

          {/* Date labels */}
          <div style={{ display: "flex", gap: 1, marginTop: 2 }}>
            {p.dailyByChannel.map((d, i) => (
              <div key={`l-${String(d.date)}`} style={{ flex: 1, textAlign: "center", fontSize: 6, color: touchIdx === i ? "#374151" : "#94A3B8", fontWeight: touchIdx === i ? 700 : 400 }}>
                {i % Math.max(1, Math.floor(p.dailyByChannel.length / 10)) === 0 ? String(d.date).substring(8) : ""}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: 6, background: "#F1F5F9" }} />

      {/* Operations */}
      <div style={{ padding: "12px 10px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>💰</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#64748B" }}>Công nợ</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: p.outstanding > 0 ? "#DC2626" : "#16A34A", margin: "2px 0" }}>{formatVNDCompact(p.outstanding)}</div>
          </div>
          <div style={{ background: "#fff", border: `1px solid ${p.damageItems > 0 ? "#FECACA" : "#E2E8F0"}`, borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>⚠️</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: p.damageItems > 0 ? "#DC2626" : "#64748B" }}>Thiệt hại</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: p.damageItems > 0 ? "#DC2626" : undefined, margin: "2px 0" }}>{p.damageItems} SP</div>
          </div>
        </div>
      </div>
    </div>
  );
}
