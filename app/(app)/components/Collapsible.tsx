"use client";

import { useState, type ReactNode } from "react";

export default function Collapsible({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card" style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", background: "none", border: "none",
          cursor: "pointer", fontSize: 13, fontWeight: 700, textAlign: "left",
          borderBottom: open ? "1px solid var(--border)" : "none",
        }}
      >
        <span style={{ fontSize: 10, color: "#9CA3AF", transition: "transform .15s", transform: open ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
        <span style={{ flex: 1 }}>{title}</span>
        {badge}
      </button>
      {open && <div style={{ padding: "12px 14px" }}>{children}</div>}
    </div>
  );
}
