"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { formatVNDCompact } from "@/lib/format";
import AutoSyncToday from "../components/AutoSyncToday";

function daysAgo(d: number): string { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().substring(0, 10); }

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
  const [navLoading, setNavLoading] = useState(false);
  useEffect(() => { setNavLoading(false); }, [p.today]);

  const statusColor = (pct: number) => pct >= 100 ? "#16A34A" : pct >= 70 ? "#D97706" : pct > 0 ? "#DC2626" : "#94A3B8";
  const adsColor = (pct: number) => pct <= 0 ? "#94A3B8" : pct <= 5 ? "#16A34A" : pct <= 7 ? "#D97706" : "#DC2626";
  const heroColor = statusColor(p.revPct);

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", paddingBottom: 80 }}>
      <AutoSyncToday extraSyncs={["/api/tiktok/sync-ads", "/api/tiktok/sync-gmv-max", "/api/fb/sync-ads", "/api/shopee/sync-ads"]} />

      {/* ── HEADER — chuẩn Year ── */}
      <div style={{ background: "linear-gradient(135deg,#7C3AED,#4C1D95)", padding: "14px 14px 16px", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{p.dayOfWeek}</div>
            <div style={{ fontSize: 11, opacity: .6 }}>{p.displayDate} · KH: {formatVNDCompact(p.dailyTarget)}</div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {(() => {
              const isToday = p.today === daysAgo(0);
              const isYesterday = p.today === daysAgo(-1);
              const isTodayActive = isToday;
              const isYesterdayActive = isYesterday;
              return (<>
                <Link href="/dash?view=day" onClick={() => { setNavLoading(true); }} style={{ background: isTodayActive ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.1)", color: isTodayActive ? "#fff" : "rgba(255,255,255,.5)", padding: "5px 10px", borderRadius: 8, fontSize: 10, fontWeight: 600, textDecoration: "none" }}>Hôm nay</Link>
                <Link href={`/dash?view=day&date=${daysAgo(-1)}`} onClick={() => { setNavLoading(true); }} style={{ background: isYesterdayActive ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.1)", color: isYesterdayActive ? "#fff" : "rgba(255,255,255,.5)", padding: "5px 10px", borderRadius: 8, fontSize: 10, fontWeight: 600, textDecoration: "none" }}>Hôm qua</Link>
              </>);
            })()}
            <Link href={`/dash?view=day&date=${p.prevDay}`} onClick={() => setNavLoading(true)} style={{ background: "rgba(255,255,255,.1)", color: "#fff", width: 30, height: 30, borderRadius: 8, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>‹</Link>
            <Link href={`/dash?view=day&date=${p.nextDay}`} onClick={() => setNavLoading(true)} style={{ background: "rgba(255,255,255,.1)", color: "#fff", width: 30, height: 30, borderRadius: 8, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>›</Link>
          </div>
        </div>
      </div>

      {/* ── HERO — dynamic color giống Year ── */}
      <div style={{ margin: "8px 10px 0", borderRadius: 14, padding: 14, color: "#fff", background: `linear-gradient(135deg, ${heroColor}, ${heroColor}CC)` }}>
        <div style={{ fontSize: 11, opacity: .8 }}>DOANH THU THÀNH CÔNG</div>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1 }}>{formatVNDCompact(p.revTotal)}</div>
        <div style={{ fontSize: 11, opacity: .7 }}>{p.revOrders.toLocaleString("vi-VN")} đơn · KH ngày: {formatVNDCompact(p.dailyTarget)}</div>
        <div style={{ height: 6, background: "rgba(255,255,255,.2)", borderRadius: 3, marginTop: 10, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(p.revPct, 100)}%`, background: "#fff", borderRadius: 3 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: .8, marginTop: 3 }}>
          <span>{p.revPct}% KH ngày</span>
          <span>{p.revChange >= 0 ? "+" : ""}{p.revChange}% vs hôm qua ({formatVNDCompact(p.revYesterday)})</span>
        </div>
      </div>

      {/* ── Mini KPIs — chuẩn Year ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "8px 10px 0" }}>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>DT Dự kiến</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#D97706", margin: "2px 0" }}>{formatVNDCompact(p.revExpected)}</div>
          <div style={{ fontSize: 9, color: "#94A3B8" }}>tạo - hoàn hủy</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>Chi phí Ads</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: adsColor(p.adsPct), margin: "2px 0" }}>{formatVNDCompact(p.adsTotal)}</div>
          <div style={{ fontSize: 9, color: adsColor(p.adsPct), fontWeight: 600 }}>{p.adsPct.toFixed(1)}% DT · ROAS {p.roas.toFixed(1)}x</div>
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

        {navLoading && <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 999, background: "#7C3AED", color: "#fff", textAlign: "center", padding: "6px 0", fontSize: 12, fontWeight: 600 }}>Đang tải dữ liệu...</div>}

        {p.channels.map(ch => {
          const change = pctChange(ch.rev, ch.revYesterday);
          const pctTarget = ch.dailyTarget > 0 ? Math.round(ch.rev / ch.dailyTarget * 100) : 0;
          const chAdsPct = ch.rev > 0 && p.adsTotal > 0 ? 0 : 0; // ads per channel not available in day
          return (
            <div key={ch.name} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: ch.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff" }}>{ch.name[0]}</div>
                <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{ch.name}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: statusColor(pctTarget) }}>{formatVNDCompact(ch.rev)}</div>
              </div>
              <div style={{ height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden", marginBottom: 3 }}>
                <div style={{ height: "100%", width: `${Math.min(pctTarget, 100)}%`, background: pctTarget >= 100 ? "#22C55E" : pctTarget >= 70 ? ch.color : "#F59E0B", borderRadius: 3 }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, background: "#F8FAFC", borderRadius: 8, padding: "6px 8px" }}>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>KH ngày</div><div style={{ fontSize: 10, fontWeight: 700 }}>{formatVNDCompact(ch.dailyTarget)}</div></div>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>Đạt</div><div style={{ fontSize: 10, fontWeight: 700, color: statusColor(pctTarget) }}>{pctTarget}%</div></div>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>Hôm qua</div><div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF" }}>{formatVNDCompact(ch.revYesterday)}</div></div>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>+/-%</div><div style={{ fontSize: 10, fontWeight: 700, color: change >= 0 ? "#16A34A" : "#DC2626" }}>{change >= 0 ? "+" : ""}{change}%</div></div>
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

        {/* Per-platform — flat icon giống channel cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <div style={{ width: 20, height: 20, borderRadius: 5, background: "#1877F2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff" }}>FB</div>
              <div style={{ fontSize: 11, fontWeight: 700, flex: 1 }}>Facebook</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#DC2626" }}>{formatVNDCompact(p.adsFb)}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 3 }}><span style={{ color: "#94A3B8" }}>% DT</span><span style={{ fontWeight: 700, color: adsColor(p.channels[0]?.rev > 0 ? (p.adsFb / p.channels[0].rev * 100) : 0) }}>{p.channels[0]?.rev > 0 ? (p.adsFb / p.channels[0].rev * 100).toFixed(1) : "0.0"}%</span></div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <div style={{ width: 20, height: 20, borderRadius: 5, background: "#18181B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff" }}>TT</div>
              <div style={{ fontSize: 11, fontWeight: 700, flex: 1 }}>TikTok</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#DC2626" }}>{formatVNDCompact(p.adsTtBm + p.adsTtGmv)}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 3 }}><span style={{ color: "#94A3B8" }}>BM</span><span style={{ fontWeight: 700 }}>{formatVNDCompact(p.adsTtBm)}</span><span style={{ fontWeight: 700, color: adsColor(p.adsTtBmRev > 0 ? (p.adsTtBm / p.adsTtBmRev * 100) : 0), marginLeft: 4 }}>{p.adsTtBmRev > 0 ? (p.adsTtBm / p.adsTtBmRev * 100).toFixed(1) : "0.0"}%</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 2 }}><span style={{ color: "#94A3B8" }}>GMV Max</span><span style={{ fontWeight: 700 }}>{formatVNDCompact(p.adsTtGmv)}</span><span style={{ fontWeight: 700, color: adsColor(p.adsTtGmvRev > 0 ? (p.adsTtGmv / p.adsTtGmvRev * 100) : 0), marginLeft: 4 }}>{p.adsTtGmvRev > 0 ? (p.adsTtGmv / p.adsTtGmvRev * 100).toFixed(1) : "0.0"}%</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 3, borderTop: "1px solid #F1F5F9", paddingTop: 3 }}><span style={{ color: "#94A3B8" }}>% DT kênh</span><span style={{ fontWeight: 700, color: adsColor((p.channels.find(c => c.name === "TikTok")?.rev || 0) > 0 ? ((p.adsTtBm + p.adsTtGmv) / (p.channels.find(c => c.name === "TikTok")?.rev || 1) * 100) : 0) }}>{(p.channels.find(c => c.name === "TikTok")?.rev || 0) > 0 ? ((p.adsTtBm + p.adsTtGmv) / (p.channels.find(c => c.name === "TikTok")?.rev || 1) * 100).toFixed(1) : "0.0"}%</span></div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <div style={{ width: 20, height: 20, borderRadius: 5, background: "#EE4D2D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff" }}>SP</div>
              <div style={{ fontSize: 11, fontWeight: 700, flex: 1 }}>Shopee</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#DC2626" }}>{formatVNDCompact(p.adsSp)}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 3 }}><span style={{ color: "#94A3B8" }}>% DT</span><span style={{ fontWeight: 700, color: adsColor((p.channels.find(c => c.name === "Shopee")?.rev || 0) > 0 ? (p.adsSp / (p.channels.find(c => c.name === "Shopee")?.rev || 1) * 100) : 0) }}>{(p.channels.find(c => c.name === "Shopee")?.rev || 0) > 0 ? (p.adsSp / (p.channels.find(c => c.name === "Shopee")?.rev || 1) * 100).toFixed(1) : "0.0"}%</span></div>
          </div>
        </div>
      </div>

      <div style={{ height: 6, background: "#F1F5F9" }} />

      {/* ── Operations ── */}
      <div style={{ padding: "12px 10px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Vận hành</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>Hàng nhập</div>
            <div style={{ fontSize: 20, fontWeight: 800, margin: "2px 0" }}>{p.arrivedCount} đơn</div>
            <div style={{ fontSize: 9, color: "#94A3B8" }}>Hôm qua: {p.arrivedYesterdayCount}</div>
          </div>
          <div style={{ background: "#fff", border: `1px solid ${p.damageCount > 0 ? "#FECACA" : "#E2E8F0"}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: p.damageCount > 0 ? "#DC2626" : "#94A3B8", textTransform: "uppercase" }}>Thiệt hại</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: p.damageCount > 0 ? "#DC2626" : undefined, margin: "2px 0" }}>{p.damageCount} SP</div>
            <div style={{ fontSize: 9, color: "#94A3B8" }}>{formatVNDCompact(p.damageValue)} chờ xử lý</div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>Việc hôm nay</div>
            <div style={{ fontSize: 20, fontWeight: 800, margin: "2px 0" }}>{p.tasksTotal} việc</div>
            <div style={{ fontSize: 9, color: "#94A3B8" }}>{p.tasksDone} đã xong</div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" }}>Tiến độ tháng</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#16A34A", margin: "2px 0" }}>{p.monthTarget > 0 ? Math.round(p.monthRevenue / p.monthTarget * 100) : 0}%</div>
            <div style={{ fontSize: 9, color: "#94A3B8" }}>{formatVNDCompact(p.monthRevenue)} / {formatVNDCompact(p.monthTarget)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
