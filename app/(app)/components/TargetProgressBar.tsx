"use client";

import { formatVNDCompact } from "@/lib/format";

export default function TargetProgressBar({
  channel,
  monthTarget,
  monthActual,
  monthKey,
  color,
}: {
  channel: string;
  monthTarget: number;
  monthActual: number;
  monthKey: string;
  color?: string;
}) {
  if (monthTarget <= 0) return null;

  const pctRaw = (monthActual / monthTarget) * 100;
  const pct = Math.round(pctRaw);
  const remaining = Math.max(0, monthTarget - monthActual);
  const exceeded = monthActual > monthTarget ? monthActual - monthTarget : 0;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const dayPct = Math.round((dayOfMonth / daysInMonth) * 100);
  const isAhead = pct >= dayPct;
  const monthNum = monthKey ? monthKey.substring(5, 7) : "";

  const fillColor = pct >= 100 ? "#16A34A" : isAhead ? (color || "#3B82F6") : "#F59E0B";
  const chipBg = pct >= 100 ? "rgba(22,163,74,0.15)" : isAhead ? "rgba(22,163,74,0.15)" : "rgba(245,158,11,0.2)";
  const chipColor = pct >= 100 ? "#15803D" : isAhead ? "#15803D" : "#92400E";
  const chipText = pct >= 100 ? "Đạt!" : isAhead ? "Vượt" : "Chậm";
  const avgPerDay = dayOfMonth > 0 ? monthActual / dayOfMonth : 0;

  return (
    <div style={{
      background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6,
      padding: "6px 12px", marginBottom: 10,
    }}>
      {/* Row: title + chip + track + stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#111", whiteSpace: "nowrap" }}>
          {channel.toUpperCase()} T{monthNum}
        </span>
        <span style={{
          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
          background: chipBg, color: chipColor, whiteSpace: "nowrap",
        }}>
          {chipText}
        </span>

        {/* Track bar */}
        <div style={{
          flex: 1, position: "relative", height: 14, background: "#F3F4F6",
          borderRadius: 3, overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%", borderRadius: 3,
            width: `${Math.min(pctRaw, 100)}%`, background: fillColor,
            display: "flex", alignItems: "center", justifyContent: "center",
            minWidth: pct > 0 ? 28 : 0,
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>{pct}%</span>
          </div>
          {pct < 100 && (
            <div style={{
              position: "absolute", top: 0, left: `${dayPct}%`, width: 1,
              height: "100%", background: "#000", opacity: 0.3,
            }} />
          )}
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 8, fontSize: 10, color: "#111", whiteSpace: "nowrap" }}>
          <span>Đạt <strong style={{ color: "#16A34A" }}>{formatVNDCompact(monthActual)}</strong></span>
          <span style={{ color: "#9CA3AF" }}>|</span>
          <span>KH <strong>{formatVNDCompact(monthTarget)}</strong></span>
          <span style={{ color: "#9CA3AF" }}>|</span>
          {exceeded > 0 ? (
            <span>Vượt <strong style={{ color: "#16A34A" }}>+{formatVNDCompact(exceeded)}</strong></span>
          ) : (
            <span>Còn <strong style={{ color: "#DC2626" }}>{formatVNDCompact(remaining)}</strong></span>
          )}
        </div>
      </div>

      {/* Sub line */}
      <div style={{ fontSize: 9, color: "#9CA3AF" }}>
        Ngày {dayOfMonth}/{daysInMonth} · {dayPct}% thời gian · TB {formatVNDCompact(avgPerDay)}/ngày
      </div>
    </div>
  );
}
