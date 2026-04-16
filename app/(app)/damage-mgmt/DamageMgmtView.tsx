"use client";

import Link from "next/link";
import { useMemo } from "react";
import { formatVND, toNum } from "@/lib/format";
import type { DamageItem } from "@/lib/db/finance";

export default function DamageMgmtView({
  items,
  tab,
}: {
  items: DamageItem[];
  tab: "pending" | "done";
}) {
  // Group by supplier
  const bySupplier = useMemo(() => {
    const m = new Map<string, { items: DamageItem[]; total: number }>();
    for (const it of items) {
      const k = it.supplier_name || "(Không rõ NCC)";
      const cur = m.get(k) || { items: [], total: 0 };
      cur.items.push(it);
      cur.total += toNum(it.damage_amount);
      m.set(k, cur);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [items]);

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">🔧 Xử lý hàng hỏng</div>
          <div className="page-sub">Các SP lỗi do TECH ghi nhận — liên hệ NCC đổi/hoàn tiền</div>
        </div>
      </div>

      <div className="mini-tabs">
        <Link href="/damage-mgmt?tab=pending" className={"mini-tab" + (tab === "pending" ? " active" : "")} style={{ textDecoration: "none" }}>
          ⏳ Cần xử lý
        </Link>
        <Link href="/damage-mgmt?tab=done" className={"mini-tab" + (tab === "done" ? " active" : "")} style={{ textDecoration: "none" }}>
          ✅ Đã xử lý
        </Link>
      </div>

      {bySupplier.length === 0 && (
        <div className="card muted" style={{ padding: 24, textAlign: "center" }}>
          {tab === "pending" ? "Không có hàng hỏng cần xử lý." : "Chưa có case nào đã xử lý."}
        </div>
      )}

      {bySupplier.map(([supplier, group]) => (
        <div key={supplier} className="card" style={{ marginBottom: 12, padding: 0 }}>
          <div style={{ padding: "12px 14px", background: "#FAFAFA", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 700 }}>🏢 {supplier}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {group.items.length} items · Tổng thiệt hại: <span style={{ color: "var(--red)", fontWeight: 700 }}>{formatVND(group.total)}</span>
              </div>
            </div>
            <Link href={`/finance?tab=damage`} className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>
              Xử lý →
            </Link>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th style={{ width: 120 }}>Đơn</th>
                <th>Sản phẩm</th>
                <th className="text-right" style={{ width: 80 }}>Hỏng SL</th>
                <th className="text-right" style={{ width: 140 }}>Thiệt hại</th>
                <th style={{ width: 160 }}>Trạng thái XL</th>
                <th>Ghi chú</th>
              </tr></thead>
              <tbody>
                {group.items.map((it) => (
                  <tr key={`${it.order_id}-${it.line_id}`}>
                    <td>
                      <Link href={`/create?order_id=${it.order_id}`} style={{ color: "var(--blue)", fontWeight: 700, fontSize: 12 }}>
                        {it.order_id}
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{it.product_name}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{it.sku || "—"}</div>
                    </td>
                    <td className="text-right" style={{ color: "var(--red)" }}>{toNum(it.damage_qty)}</td>
                    <td className="text-right font-bold" style={{ color: "var(--red)" }}>{formatVND(it.damage_amount)}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {it.resolution_type && <span className="chip chip-blue" style={{ marginRight: 4 }}>{it.resolution_type}</span>}
                      {it.resolution_status || "pending"}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>{it.damage_note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
