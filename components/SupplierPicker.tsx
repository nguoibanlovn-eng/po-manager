"use client";

import { useState, useRef, useEffect } from "react";

type Supplier = { supplier_name: string; supplier_contact: string | null };

export default function SupplierPicker({
  suppliers,
  value,
  onChange,
  placeholder = "Gõ tìm NCC...",
  style,
}: {
  suppliers: Supplier[];
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query.trim()
    ? suppliers.filter((s) => s.supplier_name.toLowerCase().includes(query.toLowerCase())).slice(0, 12)
    : suppliers.slice(0, 12);

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{ width: "100%", padding: "7px 11px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 12, outline: "none", fontFamily: "inherit" }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: "#fff", border: "1px solid #E2E8F0", borderRadius: 7,
          boxShadow: "0 4px 12px rgba(0,0,0,.1)", maxHeight: 200, overflowY: "auto", marginTop: 2,
        }}>
          {filtered.map((s) => (
            <div
              key={s.supplier_name}
              onClick={() => { onChange(s.supplier_name); setQuery(s.supplier_name); setOpen(false); }}
              style={{
                padding: "7px 11px", cursor: "pointer", fontSize: 12,
                background: s.supplier_name === value ? "#F0F9FF" : undefined,
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#F8FAFC"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = s.supplier_name === value ? "#F0F9FF" : ""; }}
            >
              <div style={{ fontWeight: 600 }}>{s.supplier_name}</div>
              {s.supplier_contact && <div style={{ fontSize: 10, color: "#94A3B8" }}>{s.supplier_contact}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
