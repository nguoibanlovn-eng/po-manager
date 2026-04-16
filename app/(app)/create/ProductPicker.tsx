"use client";

import { useEffect, useState } from "react";
import { formatVND } from "@/lib/format";

export type PickableProduct = {
  id: number;
  sku: string | null;
  product_name: string | null;
  cost_price: number | null;
  sell_price: number | null;
  stock: number | null;
  image_url: string | null;
  category: string | null;
};

export default function ProductPicker({
  onPick,
  onClose,
}: {
  onPick: (p: PickableProduct) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<PickableProduct[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
        const r = await res.json();
        if (r.ok) setList(r.products);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
        zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          width: "90vw",
          maxWidth: 680,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>📦 Chọn sản phẩm từ kho</div>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
          <input
            type="text"
            placeholder="🔍 Tìm SKU hoặc tên SP..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {loading && <div className="muted" style={{ textAlign: "center", padding: 20 }}>Đang tìm...</div>}
          {!loading && list.length === 0 && (
            <div className="muted" style={{ textAlign: "center", padding: 20 }}>
              {q ? `Không tìm thấy "${q}"` : "Nhập từ khoá để tìm"}
            </div>
          )}
          {list.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onPick(p); onClose(); }}
              style={{
                display: "flex",
                gap: 10,
                width: "100%",
                padding: 10,
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "#fff",
                textAlign: "left",
                cursor: "pointer",
                marginBottom: 6,
                alignItems: "center",
              }}
            >
              {p.image_url ? (
                <img src={p.image_url} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, background: "var(--bg)" }} />
              ) : (
                <div style={{ width: 40, height: 40, background: "var(--bg)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📦</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.product_name || "(Không tên)"}
                </div>
                <div className="muted" style={{ fontSize: 11, fontFamily: "monospace" }}>{p.sku || "—"}</div>
              </div>
              <div style={{ textAlign: "right", fontSize: 11 }}>
                <div style={{ fontWeight: 700, color: "var(--blue)" }}>{formatVND(p.cost_price)}</div>
                <div className="muted">Tồn: {p.stock ?? 0}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
