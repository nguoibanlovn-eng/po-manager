"use client";

import { useState } from "react";
import DashDayMobile, { type DashDayMobileProps } from "./DashDayMobile";
import DashMonthMobile, { type DashMonthMobileProps } from "./DashMonthMobile";
import DashYearMobile, { type DashYearMobileProps } from "./DashYearMobile";

export type DashMobileAllProps = {
  day: DashDayMobileProps;
  month: DashMonthMobileProps;
  year: DashYearMobileProps;
  initialView: "day" | "month" | "year";
};

const TABS = [
  { key: "day" as const, label: "Ngày", icon: "📊" },
  { key: "month" as const, label: "Tháng", icon: "📅" },
  { key: "year" as const, label: "Năm", icon: "📈" },
] as const;

export default function DashMobileWrapper({ day, month, year, initialView }: DashMobileAllProps) {
  const [view, setView] = useState<"day" | "month" | "year">(initialView);

  return (
    <>
      {/* Render active view only */}
      <div style={{ display: view === "day" ? "block" : "none" }}><DashDayMobile {...day} /></div>
      <div style={{ display: view === "month" ? "block" : "none" }}><DashMonthMobile {...month} /></div>
      <div style={{ display: view === "year" ? "block" : "none" }}><DashYearMobile {...year} /></div>

      {/* Override bottom nav for instant switching */}
      <style>{`
        @media (max-width: 900px) {
          #bottom-nav { display: none !important; }
        }
      `}</style>
      <div id="dash-mobile-nav" style={{
        position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff",
        borderTop: "1px solid #E2E8F0", display: "flex", zIndex: 200,
        padding: "4px 0 env(safe-area-inset-bottom, 20px)",
        boxShadow: "0 -2px 10px rgba(0,0,0,.05)",
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setView(t.key); window.scrollTo(0, 0); }}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
              padding: "6px 0", background: "none", border: "none", cursor: "pointer",
              color: view === t.key ? "#3B82F6" : "#94A3B8",
            }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 9, fontWeight: 600 }}>{t.label}</span>
          </button>
        ))}
        <a href="/inventory" style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
          padding: "6px 0", textDecoration: "none", color: "#94A3B8",
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>📦</span>
          <span style={{ fontSize: 9, fontWeight: 600 }}>Tồn kho</span>
        </a>
        <button onClick={() => {
          const d = document.getElementById("dash-mobile-drawer");
          if (d) d.style.display = d.style.display === "block" ? "none" : "block";
        }} style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
          padding: "6px 0", background: "none", border: "none", cursor: "pointer", color: "#94A3B8",
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>☰</span>
          <span style={{ fontSize: 9, fontWeight: 600 }}>Menu</span>
        </button>
      </div>
    </>
  );
}
