"use client";

import { useEffect, useState } from "react";
import DashDayMobile, { type DashDayMobileProps } from "./DashDayMobile";
import DashMonthMobile, { type DashMonthMobileProps } from "./DashMonthMobile";
import DashYearMobile, { type DashYearMobileProps } from "./DashYearMobile";

type AllData = { day: DashDayMobileProps; month: DashMonthMobileProps; year: DashYearMobileProps };

export default function DashMobileWrapper({ initialView }: { initialView: "day" | "month" | "year" }) {
  const [view, setView] = useState(initialView);
  const [data, setData] = useState<AllData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dash/mobile-data")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", paddingBottom: 80 }}>
      <div style={{ background: "linear-gradient(135deg,#1E3A5F,#0F172A)", padding: "14px 14px 16px", color: "#fff" }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Dashboard</div>
        <div style={{ fontSize: 11, opacity: .6 }}>Đang tải...</div>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ height: 140, borderRadius: 14, background: "linear-gradient(90deg,#E2E8F0 25%,#F1F5F9 50%,#E2E8F0 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ height: 80, borderRadius: 14, background: "linear-gradient(90deg,#E2E8F0 25%,#F1F5F9 50%,#E2E8F0 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />
          <div style={{ height: 80, borderRadius: 14, background: "linear-gradient(90deg,#E2E8F0 25%,#F1F5F9 50%,#E2E8F0 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />
        </div>
        {[1, 2, 3, 4].map(i => <div key={i} style={{ height: 90, borderRadius: 12, background: "linear-gradient(90deg,#E2E8F0 25%,#F1F5F9 50%,#E2E8F0 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />)}
      </div>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );

  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Không tải được data</div>;

  return (
    <>
      {/* Render all 3 views, show/hide instantly */}
      <div style={{ display: view === "day" ? "block" : "none" }}><DashDayMobile {...data.day} /></div>
      <div style={{ display: view === "month" ? "block" : "none" }}><DashMonthMobile {...data.month} /></div>
      <div style={{ display: view === "year" ? "block" : "none" }}><DashYearMobile {...data.year} /></div>

      {/* Override bottom nav */}
      <style>{`@media(max-width:900px){#bottom-nav{display:none!important}}`}</style>
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff",
        borderTop: "1px solid #E2E8F0", display: "flex", zIndex: 200,
        padding: "4px 0 calc(4px + env(safe-area-inset-bottom, 16px))",
        boxShadow: "0 -2px 10px rgba(0,0,0,.05)",
      }}>
        {([["day", "Ngày", "📊"], ["month", "Tháng", "📅"], ["year", "Năm", "📈"]] as const).map(([k, l, ic]) => (
          <button key={k} onClick={() => { setView(k); window.scrollTo(0, 0); }}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "6px 0", background: "none", border: "none", cursor: "pointer", color: view === k ? "#3B82F6" : "#94A3B8" }}>
            <span style={{ fontSize: 18 }}>{ic}</span>
            <span style={{ fontSize: 9, fontWeight: 600 }}>{l}</span>
          </button>
        ))}
        <a href="/inventory" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "6px 0", textDecoration: "none", color: "#94A3B8" }}>
          <span style={{ fontSize: 18 }}>📦</span><span style={{ fontSize: 9, fontWeight: 600 }}>Tồn kho</span>
        </a>
        <button onClick={() => document.getElementById("bottom-nav")?.parentElement?.querySelector("button:last-child")?.dispatchEvent(new Event("click", { bubbles: true }))}
          style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "6px 0", background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}>
          <span style={{ fontSize: 18 }}>☰</span><span style={{ fontSize: 9, fontWeight: 600 }}>Menu</span>
        </button>
      </div>
    </>
  );
}
