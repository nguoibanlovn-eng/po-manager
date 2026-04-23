"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DashDayMobile, { type DashDayMobileProps } from "./DashDayMobile";
import DashMonthMobile, { type DashMonthMobileProps } from "./DashMonthMobile";
import DashYearMobile, { type DashYearMobileProps } from "./DashYearMobile";

type ViewKey = "day" | "month" | "year";

/**
 * Mobile dashboard wrapper — client-side tab switching.
 * Server passes initial view's data. Other views loaded on first visit.
 * Data cached in memory — pull-to-refresh to reload.
 */
export default function DashMobileWrapper({
  initialView,
  dayProps,
  monthProps,
  yearProps,
}: {
  initialView: ViewKey;
  dayProps?: DashDayMobileProps;
  monthProps?: DashMonthMobileProps;
  yearProps?: DashYearMobileProps;
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewKey>(initialView);
  const cache = useRef<{ day?: DashDayMobileProps; month?: DashMonthMobileProps; year?: DashYearMobileProps }>({
    day: dayProps, month: monthProps, year: yearProps,
  });
  const [, forceUpdate] = useState(0);

  // Fetch missing view data
  const fetchView = useCallback(async (key: ViewKey) => {
    if (cache.current[key]) return;
    try {
      const viewParam = key === "day" ? "day" : key === "month" ? "month" : "year";
      const res = await fetch(`/api/dash/mobile-data?view=${viewParam}`);
      if (res.ok) {
        const data = await res.json();
        cache.current[key] = data[key];
        forceUpdate(n => n + 1);
      }
    } catch { /* silent */ }
  }, []);

  const switchTab = useCallback((key: ViewKey) => {
    setView(key);
    window.scrollTo(0, 0);
    if (!cache.current[key]) fetchView(key);
  }, [fetchView]);

  // Pull-to-refresh
  const touchStartY = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy > 120 && window.scrollY === 0 && !refreshing) {
      setRefreshing(true);
      // Clear cache + reload current view
      cache.current = {};
      router.refresh();
      setTimeout(() => setRefreshing(false), 2000);
    }
  }, [refreshing, router]);

  // Skeleton for uncached view
  const Skeleton = () => (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", paddingBottom: 80 }}>
      <div style={{ background: "linear-gradient(135deg,#1E3A5F,#0F172A)", padding: "14px 14px 16px", color: "#fff" }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Dashboard</div>
        <div style={{ fontSize: 11, opacity: .6 }}>Đang tải...</div>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {[140, 80, 100, 100, 100].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: i === 0 ? 14 : 12, background: "linear-gradient(90deg,#E2E8F0 25%,#F1F5F9 50%,#E2E8F0 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />
        ))}
      </div>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Pull-to-refresh indicator */}
      {refreshing && (
        <div style={{ position: "fixed", top: 50, left: "50%", transform: "translateX(-50%)", zIndex: 300, background: "#1F2937", color: "#fff", padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
          ↻ Đang cập nhật...
        </div>
      )}

      {/* Views — show/hide instantly */}
      <div style={{ display: view === "day" ? "block" : "none" }}>
        {cache.current.day ? <DashDayMobile {...cache.current.day} /> : <Skeleton />}
      </div>
      <div style={{ display: view === "month" ? "block" : "none" }}>
        {cache.current.month ? <DashMonthMobile {...cache.current.month} /> : <Skeleton />}
      </div>
      <div style={{ display: view === "year" ? "block" : "none" }}>
        {cache.current.year ? <DashYearMobile {...cache.current.year} /> : <Skeleton />}
      </div>

      {/* Bottom nav — instant switching */}
      <style>{`@media(max-width:900px){#bottom-nav{display:none!important}}`}</style>
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff",
        borderTop: "1px solid #E2E8F0", display: "flex", zIndex: 200,
        padding: "4px 0 calc(4px + env(safe-area-inset-bottom, 16px))",
        boxShadow: "0 -2px 10px rgba(0,0,0,.05)",
      }}>
        {([["day", "Ngày", "📊"], ["month", "Tháng", "📅"], ["year", "Năm", "📈"]] as const).map(([k, l, ic]) => (
          <button key={k} onClick={() => switchTab(k)}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "6px 0", background: "none", border: "none", cursor: "pointer", color: view === k ? "#3B82F6" : "#94A3B8" }}>
            <span style={{ fontSize: 18 }}>{ic}</span>
            <span style={{ fontSize: 9, fontWeight: 600 }}>{l}</span>
          </button>
        ))}
        <a href="/inventory" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "6px 0", textDecoration: "none", color: "#94A3B8" }}>
          <span style={{ fontSize: 18 }}>📦</span><span style={{ fontSize: 9, fontWeight: 600 }}>Tồn kho</span>
        </a>
        <button onClick={() => document.getElementById("bottom-nav")?.parentElement?.querySelector<HTMLButtonElement>("button:last-child")?.click()}
          style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "6px 0", background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}>
          <span style={{ fontSize: 18 }}>☰</span><span style={{ fontSize: 9, fontWeight: 600 }}>Menu</span>
        </button>
      </div>
    </div>
  );
}
