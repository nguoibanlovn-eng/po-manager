"use client";

import Link from "next/link";
import { formatVNDCompact } from "@/lib/format";
import AutoSyncToday from "../components/AutoSyncToday";

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
  outstanding: number;
  damageItems: number;
  damageValue: number;
};

export default function DashMonthMobile(p: DashMonthMobileProps) {
  const timePct = p.lastDay > 0 ? Math.round((p.dayOfMonth / p.lastDay) * 100) : 0;
  const revPct = p.totalTarget > 0 ? Math.round((p.revTotal / p.totalTarget) * 100) : 0;
  const avgDaily = p.dayOfMonth > 0 ? p.revTotal / p.dayOfMonth : 0;
  const projected = avgDaily * p.lastDay;
  const projPct = p.totalTarget > 0 ? Math.round((projected / p.totalTarget) * 100) : 0;
  const max7d = Math.max(...p.daily.map(d => d.revenue), 1);
  const [, mm] = p.month.split("-");

  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", paddingBottom: 80 }}>
      <AutoSyncToday />

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
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>DT theo kênh vs KH</div>
        {p.channels.map(ch => {
          const pct = ch.target > 0 ? Math.round((ch.rev / ch.target) * 100) : 0;
          const chAdsPct = ch.rev > 0 ? (ch.ads / ch.rev * 100) : 0;
          const chRoas = ch.ads > 0 ? ch.rev / ch.ads : 0;
          return (
            <div key={ch.name} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: ch.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff" }}>{ch.name[0]}</div>
                <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{ch.name}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: ch.color }}>{formatVNDCompact(ch.rev)}</div>
              </div>
              <div style={{ height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden", marginBottom: 3, position: "relative" }}>
                <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? "#22C55E" : pct >= 70 ? ch.color : "#F59E0B", borderRadius: 3 }} />
                <div style={{ position: "absolute", top: -1, left: `${timePct}%`, width: 1, height: 8, background: "#DC2626", opacity: .4 }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, background: "#F8FAFC", borderRadius: 8, padding: "6px 8px", marginTop: 4 }}>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>KH</div><div style={{ fontSize: 10, fontWeight: 700 }}>{formatVNDCompact(ch.target)}</div></div>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>Đạt</div><div style={{ fontSize: 10, fontWeight: 700, color: pct >= 100 ? "#16A34A" : pct >= 70 ? "#374151" : "#D97706" }}>{pct}%</div></div>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>Ads</div><div style={{ fontSize: 10, fontWeight: 700, color: "#DC2626" }}>{ch.ads > 0 ? formatVNDCompact(ch.ads) : "—"}</div></div>
                <div><div style={{ fontSize: 8, color: "#94A3B8", textTransform: "uppercase" }}>%Ads</div><div style={{ fontSize: 10, fontWeight: 700, color: chAdsPct <= 5 ? "#16A34A" : chAdsPct <= 7 ? "#D97706" : ch.ads > 0 ? "#DC2626" : "#94A3B8" }}>{ch.ads > 0 ? `${chAdsPct.toFixed(1)}%` : "—"}</div></div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: 6, background: "#F1F5F9" }} />

      {/* Daily chart */}
      <div style={{ padding: "12px 10px" }}>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Doanh thu theo ngày</div>
          <div style={{ display: "flex", alignItems: "flex-end", height: 60, gap: 2 }}>
            {p.daily.map(d => {
              const h = (d.revenue / max7d) * 50;
              return (
                <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                  <div style={{ width: "85%", height: Math.max(h, 2), background: "#93C5FD", borderRadius: "2px 2px 0 0" }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 2, marginTop: 2 }}>
            {p.daily.map((d, i) => (
              <div key={`l-${d.date}`} style={{ flex: 1, textAlign: "center", fontSize: 6, color: "#94A3B8" }}>
                {i % Math.max(1, Math.floor(p.daily.length / 8)) === 0 ? d.date.substring(8) : ""}
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
