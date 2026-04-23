"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import DashDayMobile, { type DashDayMobileProps } from "./DashDayMobile";
import DashMonthMobile, { type DashMonthMobileProps } from "./DashMonthMobile";
import DashYearMobile, { type DashYearMobileProps } from "./DashYearMobile";

type ViewType = "day" | "month" | "year";

// Module-level cache: survives SPA navigations, cleared on hard refresh
const viewCache = new Map<ViewType, unknown>();

export default function DashMobileTabs({
  currentView,
  dataJson,
}: {
  currentView: ViewType;
  dataJson: string;
}) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<ViewType>(currentView);
  const [isPending, startTransition] = useTransition();

  // Parse and cache the server-provided data for this view
  useEffect(() => {
    try {
      const data = JSON.parse(dataJson);
      viewCache.set(currentView, data);
    } catch { /* ignore parse errors */ }
    // When server renders a new view, sync activeView
    setActiveView(currentView);
  }, [currentView, dataJson]);

  const handleTabSwitch = useCallback((view: ViewType) => {
    if (view === activeView) return;

    if (viewCache.has(view)) {
      // Cached — instant switch, no navigation
      setActiveView(view);
    } else {
      // Not cached — navigate to server-render that view, show pending state
      setActiveView(view); // optimistic
      startTransition(() => {
        router.push(`/dash?view=${view}`);
      });
    }
  }, [activeView, router]);

  const renderView = () => {
    const data = viewCache.get(activeView);
    if (!data && isPending) {
      return <MobileSkeleton />;
    }
    if (!data) {
      return <MobileSkeleton />;
    }
    switch (activeView) {
      case "day":
        return <DashDayMobile {...(data as DashDayMobileProps)} />;
      case "month":
        return <DashMonthMobile {...(data as DashMonthMobileProps)} />;
      case "year":
        return <DashYearMobile {...(data as DashYearMobileProps)} />;
    }
  };

  return (
    <div className="dash-mobile-only" style={{ paddingBottom: 70 }}>
      <style>{`@media(max-width:900px){#bottom-nav{display:none!important}}`}</style>
      {renderView()}

      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff",
        borderTop: "1px solid #E2E8F0", display: "flex", zIndex: 200,
        padding: "4px 0 calc(4px + env(safe-area-inset-bottom, 16px))",
        boxShadow: "0 -2px 10px rgba(0,0,0,.05)",
      }}>
        {([["day", "Ngày", "📊"], ["month", "Tháng", "📅"], ["year", "Năm", "📈"]] as const).map(([k, l, ic]) => (
          <button key={k} onClick={() => handleTabSwitch(k)}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "6px 0", background: "none", border: "none", cursor: "pointer", color: activeView === k ? "#3B82F6" : "#94A3B8" }}>
            <span style={{ fontSize: 18 }}>{ic}</span>
            <span style={{ fontSize: 9, fontWeight: 600 }}>{l}</span>
          </button>
        ))}
        <a href="/inventory" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "6px 0", textDecoration: "none", color: "#94A3B8" }}>
          <span style={{ fontSize: 18 }}>📦</span><span style={{ fontSize: 9, fontWeight: 600 }}>Tồn kho</span>
        </a>
        <button onClick={() => { const el = document.getElementById("bottom-nav"); if (el) { el.style.display = "flex"; el.parentElement?.querySelector<HTMLButtonElement>("button:last-child")?.click(); } }}
          style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "6px 0", background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}>
          <span style={{ fontSize: 18 }}>☰</span><span style={{ fontSize: 9, fontWeight: 600 }}>Menu</span>
        </button>
      </nav>
    </div>
  );
}

function MobileSkeleton() {
  return (
    <div style={{ padding: 16 }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: 80,
            background: "#F3F4F6",
            borderRadius: 12,
            marginBottom: 12,
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ))}
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}
