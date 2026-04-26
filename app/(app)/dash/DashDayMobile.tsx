"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { formatVNDCompact } from "@/lib/format";
import AutoSyncToday from "../components/AutoSyncToday";

function daysAgo(d: number): string { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().substring(0, 10); }
function monthRange(offset: number) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth() + offset;
  const first = new Date(y, m, 1); const last = offset === 0 ? now : new Date(y, m + 1, 0);
  const fmt = (d: Date) => d.toISOString().substring(0, 10);
  return { from: fmt(first), to: fmt(last) };
}
const DAY_CH_RANGES = [
  { key: "today", label: "Hôm nay" },
  { key: "7d", label: "7N", from: daysAgo(-7), to: daysAgo(0) },
  { key: "14d", label: "14N", from: daysAgo(-14), to: daysAgo(0) },
  { key: "30d", label: "30N", from: daysAgo(-30), to: daysAgo(0) },
  { key: "month", label: "Tháng này", ...monthRange(0) },
  { key: "prev", label: "T.trước", ...monthRange(-1) },
  { key: "year", label: "Năm nay", from: `${new Date().getFullYear()}-01-01`, to: daysAgo(0) },
];

export type DashDayMobileProps = {
  today: string;
  prevDay: string;
  nextDay: string;
  dayOfWeek: string;
  displayDate: string;
  // Revenue
  revTotal: number;
  revOrders: number;
  revExpected: number;
  revYesterday: number;
  revChange: number;
  revPct: number;
  dailyTarget: number;
  monthlyAvg: number;
  // Channels: {name, revenue, expected, color, dailyTarget}[]
  channels: { name: string; rev: number; exp: number; revYesterday: number; color: string; dailyTarget: number }[];
  // Ads
  adsTotal: number;
  adsFb: number;
  adsTt: number;
  adsTtBm: number;
  adsTtGmv: number;
  adsTtBmRev: number;
  adsTtGmvRev: number;
  adsSp: number;
  adsPct: number;
  roas: number;
  adsYesterday: number;
  adsChange: number;
  // Operations
  arrivedCount: number;
  arrivedValue: number;
  arrivedYesterdayCount: number;
  damageCount: number;
  damageValue: number;
  tasksTotal: number;
  tasksDone: number;
  // Month progress
  monthRevenue: number;
  monthTarget: number;
};

const pctChange = (cur: number, prev: number) => {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
};

export default function DashDayMobile(p: DashDayMobileProps) {
  const [chRange, setChRange] = useState("today");
  const [chData, setChData] = useState<typeof p.channels | null>(null);
  const [chLoading, setChLoading] = useState(false);

  const loadChRange = useCallback(async (key: string) => {
    setChRange(key);
    if (key === "today") { setChData(null); return; }
    const range = DAY_CH_RANGES.find(r => r.key === key);
    if (!range || !("from" in range)) return;
    setChLoading(true);
    try {
      const res = await fetch(`/api/dash/channel-range?from=${range.from}&to=${range.to}`);
      const json = await res.json();
      if (json.ok) {
        const CH_COLORS: Record<string, string> = { Facebook: "#1877F2", TikTok: "#FE2C55", Shopee: "#EE4D2D", "Web/App": "#6366F1" };
        setChData((json.channels as Array<{ name: string; revenue: number }>).map(c => ({
          name: c.name, rev: c.revenue, exp: 0, revYesterday: 0,
          color: CH_COLORS[c.name] || "#94A3B8", dailyTarget: 0,
        })));
      }
    } catch { /* */ }
    setChLoading(false);
  }, []);

  const displayChannels = chData || p.channels;

  const S = {
    green: { bg: "#059669", grad: "linear-gradient(135deg,#059669,#10B981)" },
    amber: { bg: "#D97706" },
    red: { bg: "#DC2626" },
  };

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", paddingBottom: 80 }}>
      <AutoSyncToday extraSyncs={["/api/tiktok/sync-ads", "/api/tiktok/sync-gmv-max", "/api/fb/sync-ads", "/api/shopee/sync-ads"]} />

      {/* ── HEADER ── */}
      <div style={{ background: "linear-gradient(135deg,#1E3A5F,#0F172A)", padding: "12px 14px 0", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Dashboard</div>
            <div style={{ fontSize: 11, opacity: .6 }}>{p.dayOfWeek}, {p.displayDate}</div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <Link href={`/dash?view=day&date=${p.prevDay}`} style={{ background: "rgba(255,255,255,.1)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: 8, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>‹</Link>
            <Link href={`/dash?view=day&date=${p.nextDay}`} style={{ background: "rgba(255,255,255,.1)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: 8, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>›</Link>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <Link href="/dash?view=day" style={{ background: "rgba(255,255,255,.25)", color: "#fff", padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, textDecoration: "none" }}>Hôm nay</Link>
          <Link href={`/dash?view=day&date=${p.prevDay}`} style={{ background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.6)", padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, textDecoration: "none" }}>Hôm qua</Link>
        </div>
      </div>

      {/* ── KH NGÀY ── */}
      {p.dailyTarget > 0 && (
        <div style={{ margin: "0 10px", padding: "8px 12px", background: "linear-gradient(135deg,#1E3A5F,#0F172A)", borderRadius: "0 0 12px 12px", marginTop: -1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,.5)", textTransform: "uppercase", letterSpacing: .5 }}>KH ngày</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{formatVNDCompact(p.dailyTarget)}</span>
            <span style={{ fontSize: 9, color: p.revTotal >= p.dailyTarget ? "#4ADE80" : "rgba(255,255,255,.5)" }}>
              {p.revTotal >= p.dailyTarget ? "✓ Đạt" : `Còn ${formatVNDCompact(Math.max(0, p.dailyTarget - p.revTotal))}`}
            </span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {p.channels.map(ch => {
              const pct = ch.dailyTarget > 0 ? Math.min(Math.round(ch.rev / ch.dailyTarget * 100), 999) : 0;
              const achieved = ch.rev >= ch.dailyTarget && ch.dailyTarget > 0;
              return (
                <div key={ch.name} style={{ flex: 1, background: "rgba(255,255,255,.08)", borderRadius: 6, padding: "4px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: 7, color: "rgba(255,255,255,.4)", textTransform: "uppercase" }}>{ch.name.substring(0, 2)}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: achieved ? "#4ADE80" : "#fff" }}>{formatVNDCompact(ch.dailyTarget)}</div>
                  <div style={{ height: 2, background: "rgba(255,255,255,.15)", borderRadius: 1, marginTop: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: achieved ? "#4ADE80" : pct >= 70 ? "#FBBF24" : "#F87171", borderRadius: 1 }} />
                  </div>
                  <div style={{ fontSize: 7, color: achieved ? "#4ADE80" : "rgba(255,255,255,.4)", marginTop: 1 }}>{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── HERO: DT Thành công ── */}
      <div style={{ background: "linear-gradient(135deg,#059669,#10B981)", margin: "8px 10px 0", borderRadius: 14, padding: 14, color: "#fff" }}>
        <div style={{ fontSize: 11, opacity: .8 }}>DOANH THU THÀNH CÔNG</div>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1 }}>{formatVNDCompact(p.revTotal)}</div>
        <div style={{ fontSize: 11, opacity: .7 }}>{p.revOrders.toLocaleString("vi-VN")} đơn thành công</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(255,255,255,.2)", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8, marginTop: 6 }}>
          {p.revChange >= 0 ? "▲" : "▼"} {p.revChange >= 0 ? "+" : ""}{p.revChange}% vs hôm qua ({formatVNDCompact(p.revYesterday)})
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,.2)", borderRadius: 3, marginTop: 10, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(p.revPct, 100)}%`, background: "#fff", borderRadius: 3 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: .7, marginTop: 3 }}>
          <span>{p.revPct}% KH ngày</span><span>KH: {formatVNDCompact(p.dailyTarget)}</span>
        </div>
      </div>

      {/* ── Mini KPIs: DK + Ads ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "8px 10px 0" }}>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>DT Dự kiến</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#D97706", margin: "2px 0" }}>{formatVNDCompact(p.revExpected)}</div>
          <div style={{ fontSize: 9, color: "#94A3B8" }}>tạo - hoàn hủy</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>Chi phí Ads</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#DC2626", margin: "2px 0" }}>{formatVNDCompact(p.adsTotal)}</div>
          <div style={{ fontSize: 9, color: "#94A3B8" }}>{p.adsPct.toFixed(1)}% DT · ROAS {p.roas.toFixed(1)}x</div>
        </div>
      </div>

      {/* ── Channels ── */}
      <div style={{ padding: "12px 10px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
          Doanh thu theo kênh
        </div>
        {/* Stacked bar */}
        {p.revTotal > 0 && (
          <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 4 }}>
            {p.channels.map(ch => {
              const pct = p.revTotal > 0 ? (ch.rev / p.revTotal * 100) : 0;
              if (pct < 1) return null;
              return <div key={ch.name} style={{ width: `${pct}%`, background: ch.color }} />;
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 9, color: "#64748B", flexWrap: "wrap" }}>
          {p.channels.map(ch => {
            const pct = p.revTotal > 0 ? Math.round(ch.rev / p.revTotal * 100) : 0;
            return <span key={ch.name} style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: ch.color, flexShrink: 0 }} />{ch.name.substring(0, 2)} {pct}%</span>;
          })}
        </div>

        {/* Quick range filter for channels */}
        <div style={{ display: "flex", gap: 4, marginBottom: 8, overflowX: "auto", paddingBottom: 2 }}>
          {DAY_CH_RANGES.map(r => (
            <button key={r.key} onClick={() => loadChRange(r.key)} style={{
              padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer",
              border: chRange === r.key ? "1.5px solid #7C3AED" : "1px solid #E2E8F0",
              background: chRange === r.key ? "#F3E8FF" : "#fff",
              color: chRange === r.key ? "#7C3AED" : "#64748B",
              whiteSpace: "nowrap", fontFamily: "inherit",
            }}>{r.label}</button>
          ))}
        </div>
        {chLoading && <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 999, background: "#7C3AED", color: "#fff", textAlign: "center", padding: "6px 0", fontSize: 12, fontWeight: 600 }}>Đang tải dữ liệu...</div>}

        {displayChannels.map(ch => {
          const change = chRange === "today" ? pctChange(ch.rev, ch.revYesterday) : 0;
          return (
            <div key={ch.name} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: ch.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{ch.name[0]}</div>
                <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{ch.name}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: ch.color }}>{formatVNDCompact(ch.rev)}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, background: "#F8FAFC", borderRadius: 8, padding: "6px 8px" }}>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>TC</div><div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A" }}>{formatVNDCompact(ch.rev)}</div></div>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>Dự kiến</div><div style={{ fontSize: 11, fontWeight: 700, color: "#D97706" }}>{formatVNDCompact(ch.exp)}</div></div>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>Hôm qua</div><div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF" }}>{formatVNDCompact(ch.revYesterday)}</div></div>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>+/-%</div><div style={{ fontSize: 11, fontWeight: 700, color: change >= 0 ? "#16A34A" : "#DC2626" }}>{change >= 0 ? "+" : ""}{change}%</div></div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: 6, background: "#F1F5F9" }} />

      {/* ── Ads breakdown ── */}
      <div style={{ padding: "12px 10px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          Chi phí Ads hôm nay <span style={{ fontSize: 10, fontWeight: 700, background: "#FEF2F2", color: "#DC2626", padding: "1px 6px", borderRadius: 6, textTransform: "none", letterSpacing: 0 }}>{formatVNDCompact(p.adsTotal)}</span>
        </div>

        {/* Summary */}
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div><div style={{ fontSize: 10, color: "#64748B" }}>Tổng chi</div><div style={{ fontSize: 16, fontWeight: 800, color: "#DC2626" }}>{formatVNDCompact(p.adsTotal)}</div></div>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#64748B" }}>% / DT</div><div style={{ fontSize: 16, fontWeight: 800, color: p.adsPct <= 5 ? "#16A34A" : p.adsPct <= 7 ? "#D97706" : "#DC2626" }}>{p.adsPct.toFixed(1)}%</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 10, color: "#64748B" }}>ROAS</div><div style={{ fontSize: 16, fontWeight: 800, color: p.roas >= 10 ? "#16A34A" : "#D97706" }}>{p.roas.toFixed(1)}x</div></div>
        </div>

        {/* Per-platform */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: "#1877F2" }} /><div style={{ fontSize: 11, fontWeight: 700 }}>Facebook</div></div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#DC2626" }}>{formatVNDCompact(p.adsFb)}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 3 }}><span style={{ color: "#94A3B8" }}>% DT</span><span style={{ fontWeight: 700, color: "#16A34A" }}>{p.channels[0]?.rev > 0 ? (p.adsFb / p.channels[0].rev * 100).toFixed(1) : "0.0"}%</span></div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: "#18181B" }} /><div style={{ fontSize: 11, fontWeight: 700 }}>TikTok</div></div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#DC2626" }}>{formatVNDCompact(p.adsTtBm + p.adsTtGmv)}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 3 }}><span style={{ color: "#94A3B8" }}>BM</span><span style={{ fontWeight: 700 }}>{formatVNDCompact(p.adsTtBm)}</span><span style={{ fontWeight: 700, color: "#16A34A", marginLeft: 4 }}>{p.adsTtBmRev > 0 ? (p.adsTtBm / p.adsTtBmRev * 100).toFixed(1) : "0.0"}%</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 2 }}><span style={{ color: "#94A3B8" }}>GMV Max</span><span style={{ fontWeight: 700 }}>{formatVNDCompact(p.adsTtGmv)}</span><span style={{ fontWeight: 700, color: "#16A34A", marginLeft: 4 }}>{p.adsTtGmvRev > 0 ? (p.adsTtGmv / p.adsTtGmvRev * 100).toFixed(1) : "0.0"}%</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 3, borderTop: "1px solid #F1F5F9", paddingTop: 3 }}><span style={{ color: "#94A3B8" }}>% DT kênh</span><span style={{ fontWeight: 700, color: "#16A34A" }}>{(p.channels.find(c => c.name === "TikTok")?.rev || 0) > 0 ? ((p.adsTtBm + p.adsTtGmv) / (p.channels.find(c => c.name === "TikTok")?.rev || 1) * 100).toFixed(1) : "0.0"}%</span></div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: "#EE4D2D" }} /><div style={{ fontSize: 11, fontWeight: 700 }}>Shopee</div></div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#DC2626" }}>{formatVNDCompact(p.adsSp)}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 3 }}><span style={{ color: "#94A3B8" }}>% DT</span><span style={{ fontWeight: 700, color: "#16A34A" }}>{(p.channels.find(c => c.name === "Shopee")?.rev || 0) > 0 ? (p.adsSp / (p.channels.find(c => c.name === "Shopee")?.rev || 1) * 100).toFixed(1) : "0.0"}%</span></div>
          </div>
        </div>
      </div>

      <div style={{ height: 6, background: "#F1F5F9" }} />

      {/* ── Operations ── */}
      <div style={{ padding: "12px 10px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Vận hành</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>📦</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#64748B" }}>Hàng nhập</div>
            <div style={{ fontSize: 18, fontWeight: 800, margin: "2px 0" }}>{p.arrivedCount} đơn</div>
            <div style={{ fontSize: 9, color: "#94A3B8" }}>Hôm qua: {p.arrivedYesterdayCount}</div>
          </div>
          <div style={{ background: "#fff", border: `1px solid ${p.damageCount > 0 ? "#FECACA" : "#E2E8F0"}`, borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>⚠️</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: p.damageCount > 0 ? "#DC2626" : "#64748B" }}>Thiệt hại</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: p.damageCount > 0 ? "#DC2626" : undefined, margin: "2px 0" }}>{p.damageCount} SP</div>
            <div style={{ fontSize: 9, color: "#94A3B8" }}>{formatVNDCompact(p.damageValue)} chờ xử lý</div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>📋</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#64748B" }}>Việc hôm nay</div>
            <div style={{ fontSize: 18, fontWeight: 800, margin: "2px 0" }}>{p.tasksTotal} việc</div>
            <div style={{ fontSize: 9, color: "#94A3B8" }}>{p.tasksDone} đã xong</div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>📊</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#64748B" }}>Tiến độ tháng</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#16A34A", margin: "2px 0" }}>{p.monthTarget > 0 ? Math.round(p.monthRevenue / p.monthTarget * 100) : 0}%</div>
            <div style={{ fontSize: 9, color: "#94A3B8" }}>{formatVNDCompact(p.monthRevenue)} / {formatVNDCompact(p.monthTarget)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
