"use client";

import { useState, useCallback } from "react";

type TooltipData = { label: string; items: Array<{ name: string; value: string; color?: string }> };

export function useChartTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; data: TooltipData } | null>(null);

  const show = useCallback((e: React.MouseEvent, data: TooltipData) => {
    const rect = (e.currentTarget as HTMLElement).closest("[data-chart]")?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10, data });
  }, []);

  const hide = useCallback(() => setTip(null), []);

  return { tip, show, hide };
}

export function ChartTooltipBox({ tip }: { tip: { x: number; y: number; data: TooltipData } | null }) {
  if (!tip) return null;
  const left = Math.max(10, Math.min(tip.x - 60, 9999));
  return (
    <div style={{
      position: "absolute", left, top: tip.y - 8, transform: "translateY(-100%)",
      background: "#1F2937", color: "#fff", borderRadius: 6, padding: "6px 10px",
      fontSize: 11, pointerEvents: "none", zIndex: 50, whiteSpace: "nowrap",
      boxShadow: "0 4px 12px rgba(0,0,0,.25)",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 3, color: "#D1D5DB" }}>{tip.data.label}</div>
      {tip.data.items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", lineHeight: 1.5 }}>
          {item.color && <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0 }} />}
          <span style={{ color: "#9CA3AF" }}>{item.name}:</span>
          <span style={{ fontWeight: 600 }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}
