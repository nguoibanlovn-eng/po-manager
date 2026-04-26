"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatDate, formatVND, toNum } from "@/lib/format";
import type { Item, OrderListItem } from "@/lib/types";
import { confirmShelfAction, saveQcAction } from "./actions";
import Collapsible from "../components/Collapsible";

const QC_OPTIONS = ["Chưa QC", "Đang QC", "Đã QC xong", "Lỗi NCC"];
const RET_OPTIONS = ["Chưa xử lý", "Đã liên hệ NCC", "Đã hoàn cọc", "Đã hoàn tiền", "Hoàn tất"];

type Tab = "active" | "done";

type EditableItem = Item & { _dirty?: boolean };

const PAGE_SIZE = 10;

export default function TechView({
  orders,
  itemsByOrder,
  activeTab,
  activeCount,
  doneCount,
}: {
  orders: OrderListItem[];
  itemsByOrder: Record<string, Item[]>;
  activeTab: Tab;
  activeCount: number;
  doneCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(orders.length / PAGE_SIZE);
  const pagedOrders = orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Stats
  const allItems = Object.values(itemsByOrder).flat();
  const totalItems = allItems.length;
  const qcDone = allItems.filter((it) => it.qc_status === "Đã QC xong").length;
  const shelfDone = allItems.filter((it) => it.shelf_done).length;
  const damaged = allItems.filter((it) => toNum(it.damage_qty) > 0).length;
  const damageCost = allItems.reduce((s, it) => s + toNum(it.damage_amount), 0);
  const waitingQc = orders.filter((o) => {
    const its = itemsByOrder[o.order_id] || [];
    return its.some((it) => it.qc_status !== "Đã QC xong");
  }).length;

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">QC & Lên kệ</div>
          <div className="page-sub">{orders.length} đơn · {totalItems} SP</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => router.refresh()}>🔄</button>
      </div>

      {/* Dashboard strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", background: "#FFFFFF", border: "1px solid #E4E4E7", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        {[
          { label: "Đang xử lý", value: String(activeCount), sub: `${activeCount} đơn`, color: "#D97706" },
          { label: "Đã hoàn thành", value: String(doneCount), sub: `${doneCount} đơn`, color: "#16A34A" },
          { label: "QC xong", value: `${qcDone}/${totalItems}`, sub: `${totalItems > 0 ? Math.round(qcDone / totalItems * 100) : 0}%`, color: "#0D9488" },
          { label: "Hàng lỗi", value: String(damaged), sub: `${damaged} SP lỗi`, color: "#DC2626" },
          { label: "Thiệt hại", value: formatVND(damageCost), sub: "giá trị lỗi", color: "#7C3AED" },
        ].map((c, i) => (
          <div key={i} style={{ padding: "12px 14px", borderRight: i < 4 ? "1px solid #E4E4E7" : undefined }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: c.color, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 10, color: "#A1A1AA" }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="mini-tabs">
        <Link href="/tech?tab=active" className={"mini-tab" + (activeTab === "active" ? " active" : "")} style={{ textDecoration: "none" }}>
          Đang xử lý <span className="cnt" style={activeCount > 0 ? { background: "#DC2626", color: "#fff" } : undefined}>{activeCount}</span>
        </Link>
        <Link href="/tech?tab=done" className={"mini-tab" + (activeTab === "done" ? " active" : "")} style={{ textDecoration: "none" }}>
          Đã hoàn thành <span className="cnt">{doneCount}</span>
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="card muted" style={{ padding: 24, textAlign: "center" }}>
          {activeTab === "active" ? "Không có đơn nào đang chờ QC." : "Chưa có đơn hoàn thành."}
        </div>
      ) : (
        <>
          {pagedOrders.map((o) => (
            <OrderQcCard
              key={o.order_id}
              order={o}
              initialItems={itemsByOrder[o.order_id] || []}
              disabled={pending}
              onSaved={() => router.refresh()}
              startTransition={startTransition}
            />
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trước</button>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Trang {page}/{totalPages} · {orders.length} đơn</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Sau →</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function OrderQcCard({
  order,
  initialItems,
  disabled,
  onSaved,
  startTransition,
}: {
  order: OrderListItem;
  initialItems: Item[];
  disabled: boolean;
  onSaved: () => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<EditableItem[]>(() => initialItems);

  function patch(line_id: string, fields: Partial<EditableItem>) {
    setItems((xs) =>
      xs.map((it) => (it.line_id === line_id ? { ...it, ...fields, _dirty: true } : it)),
    );
  }

  const dirty = items.some((it) => it._dirty);
  const qcDoneCount = items.filter((it) => it.qc_status === "Đã QC xong").length;
  const shelfDoneCount = items.filter((it) => it.shelf_done).length;
  const allShelfDone = items.length > 0 && shelfDoneCount === items.length;

  function save() {
    const patches = items
      .filter((it) => it._dirty)
      .map((it) => ({
        line_id: it.line_id,
        qc_status: it.qc_status ?? undefined,
        damage_qty: toNum(it.damage_qty),
        damage_amount: toNum(it.damage_amount),
        damage_note: it.damage_note ?? undefined,
        return_status: it.return_status ?? undefined,
        return_cost: toNum(it.return_cost),
        shelf_done: !!it.shelf_done,
        note: it.note ?? undefined,
      }));
    if (patches.length === 0) return;
    startTransition(async () => {
      const r = await saveQcAction(order.order_id, patches);
      if (!r.ok) alert(r.error);
      else {
        setItems((xs) => xs.map((it) => ({ ...it, _dirty: false })));
        onSaved();
      }
    });
  }

  function confirmShelf() {
    if (!allShelfDone) {
      if (!confirm("Chưa đánh dấu lên kệ hết. Vẫn xác nhận?")) return;
    }
    startTransition(async () => {
      const r = await confirmShelfAction(order.order_id);
      if (!r.ok) alert(r.error);
      else onSaved();
    });
  }

  const totalQty = items.reduce((s, it) => s + toNum(it.qty), 0);
  const damageCount = items.filter((it) => toNum(it.damage_qty) > 0).length;
  const damageCost = items.reduce((s, it) => s + toNum(it.damage_amount), 0);
  const qcPct = items.length > 0 ? Math.round(qcDoneCount / items.length * 100) : 0;
  const shelfPct = items.length > 0 ? Math.round(shelfDoneCount / items.length * 100) : 0;
  // Tính số ngày kể từ hàng về
  const daysAgo = order.arrival_date ? Math.max(0, Math.floor((Date.now() - new Date(order.arrival_date).getTime()) / 86400000)) : 0;
  const isUrgent = daysAgo >= 3 && (qcPct < 100 || shelfPct < 100);

  return (
    <div style={{ background: "#fff", border: `1px solid ${isUrgent ? "#FECACA" : "#E2E8F0"}`, borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: expanded ? "1px solid #E2E8F0" : "none",
          cursor: "pointer",
          background: isUrgent ? "#FEF2F2" : "#FAFBFC",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Dòng 1: tên + thời gian */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{order.order_name || order.order_id}</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
              {order.supplier_name || "—"} · {formatDate(order.arrival_date)} · <span style={{ color: isUrgent ? "#DC2626" : "#64748B", fontWeight: isUrgent ? 700 : 400 }}>{daysAgo} ngày trước</span>
            </div>
          </div>
          <span style={{ fontSize: 10, color: "#94A3B8", transform: expanded ? "rotate(90deg)" : "none", transition: "transform .2s" }}>›</span>
        </div>

        {/* KPI strip gọn */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, background: "#F8FAFC", borderRadius: 8, padding: "6px 10px", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>Sản phẩm</div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{items.length} <span style={{ fontSize: 10, fontWeight: 600, color: "#64748B" }}>({totalQty} cái)</span></div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>Đã QC</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: qcPct >= 100 ? "#16A34A" : qcPct > 0 ? "#D97706" : "#DC2626" }}>{qcDoneCount}/{items.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>Lên kệ</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: shelfPct >= 100 ? "#16A34A" : shelfPct > 0 ? "#D97706" : "#DC2626" }}>{shelfDoneCount}/{items.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>Lỗi</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: damageCount > 0 ? "#DC2626" : "#94A3B8" }}>{damageCount > 0 ? damageCount : "0"}</div>
          </div>
        </div>

        {/* Progress bars */}
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
              <span style={{ color: "#64748B", fontWeight: 600 }}>QC</span>
              <span style={{ fontWeight: 700, color: qcPct >= 100 ? "#16A34A" : "#0D9488" }}>{qcPct}%</span>
            </div>
            <div style={{ height: 5, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${qcPct}%`, height: "100%", background: qcPct >= 100 ? "#22C55E" : "#0D9488", borderRadius: 3 }} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
              <span style={{ color: "#64748B", fontWeight: 600 }}>Lên kệ</span>
              <span style={{ fontWeight: 700, color: shelfPct >= 100 ? "#16A34A" : "#16A34A" }}>{shelfPct}%</span>
            </div>
            <div style={{ height: 5, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${shelfPct}%`, height: "100%", background: shelfPct >= 100 ? "#22C55E" : "#16A34A", borderRadius: 3 }} />
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: 14 }}>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>SẢN PHẨM</th>
                  <th style={{ width: 80 }} className="text-right">SL NHẬP</th>
                  <th style={{ width: 110 }} className="text-right">GIÁ NHẬP</th>
                  <th style={{ width: 140 }}>QC</th>
                  <th style={{ width: 70 }} className="text-right">SL LỖI</th>
                  <th style={{ width: 120 }} className="text-right">CHI PHÍ LỖI (Đ)</th>
                  <th style={{ minWidth: 180 }}>GHI CHÚ LỖI</th>
                  <th style={{ width: 140 }}>LÊN KỆ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const qty = toNum(it.qty);
                  const unitPrice = toNum(it.unit_price);
                  const damageQty = toNum(it.damage_qty);
                  const damageAmount = damageQty * unitPrice;
                  const qcDone = it.qc_status === "Đã QC xong";
                  const qcError = it.qc_status === "Lỗi NCC";
                  const hasDamage = damageQty > 0;
                  // Row bg theo trạng thái
                  const rowBg = hasDamage || qcError ? "#FEF2F2" : qcDone ? "#F0FDF4" : "transparent";
                  return (
                    <tr key={it.line_id} style={{ background: rowBg }}>
                      <td className="muted">{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{it.product_name}</div>
                        <div className="muted" style={{ fontSize: 11, fontFamily: "monospace" }}>{it.sku || "—"}</div>
                      </td>
                      <td className="text-right font-bold">{qty}</td>
                      <td className="text-right muted">{formatVND(unitPrice)}</td>
                      <td>
                        <select
                          value={it.qc_status || "Chưa QC"}
                          onChange={(e) => patch(it.line_id, { qc_status: e.target.value })}
                          disabled={disabled}
                          style={{
                            background: qcDone ? "#DCFCE7" : qcError ? "#FEE2E2" : "#fff",
                            borderColor: qcDone ? "#86EFAC" : qcError ? "#FECACA" : "var(--border)",
                            color: qcDone ? "#15803D" : qcError ? "#B91C1C" : "var(--text)",
                            fontWeight: qcDone || qcError ? 700 : 400,
                          }}
                        >
                          {QC_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td className="text-right">
                        <input
                          className="text-right"
                          type="number"
                          min={0}
                          max={qty}
                          value={String(damageQty)}
                          onChange={(e) => {
                            const newDmg = Math.max(0, Math.min(qty, Number(e.target.value) || 0));
                            // Auto-sync damage_amount = damage_qty * unit_price
                            patch(it.line_id, {
                              damage_qty: newDmg,
                              damage_amount: newDmg * unitPrice,
                            });
                          }}
                          disabled={disabled}
                          style={{
                            background: hasDamage ? "#FEE2E2" : "#fff",
                            borderColor: hasDamage ? "#FECACA" : "var(--border)",
                            color: hasDamage ? "#B91C1C" : "var(--text)",
                            fontWeight: hasDamage ? 700 : 400,
                          }}
                        />
                      </td>
                      <td
                        className="text-right font-bold"
                        style={{ color: damageAmount > 0 ? "var(--red)" : "var(--muted)" }}
                      >
                        {damageAmount > 0 ? damageAmount.toLocaleString("vi-VN") : "0"}
                      </td>
                      <td>
                        <input
                          value={it.damage_note || ""}
                          onChange={(e) => patch(it.line_id, { damage_note: e.target.value })}
                          placeholder={hasDamage ? "Mô tả lỗi..." : ""}
                          disabled={disabled || !hasDamage}
                        />
                      </td>
                      <td>
                        <select
                          value={it.shelf_done ? "Đã lên kệ" : "Chưa lên kệ"}
                          onChange={(e) => patch(it.line_id, { shelf_done: e.target.value === "Đã lên kệ" })}
                          disabled={disabled}
                          style={{
                            background: it.shelf_done ? "#DCFCE7" : "#fff",
                            borderColor: it.shelf_done ? "#86EFAC" : "var(--border)",
                            color: it.shelf_done ? "#15803D" : "var(--muted)",
                            fontWeight: it.shelf_done ? 700 : 400,
                          }}
                        >
                          <option>Chưa lên kệ</option>
                          <option>Đã lên kệ</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 8 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Tổng hỏng: <b style={{ color: "var(--red)" }}>
                {formatVND(items.reduce((s, it) => s + toNum(it.damage_amount), 0))}
              </b>
            </div>
            <div className="row">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={save}
                disabled={!dirty || disabled}
              >
                💾 Lưu QC
              </button>
              {order.stage === "ARRIVED" && (
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={confirmShelf}
                  disabled={disabled}
                  title="Xác nhận toàn bộ SP đã lên kệ → chuyển sang ON_SHELF"
                >
                  ✓ Xác nhận lên kệ
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressLine({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
        <span className="muted">{label}</span>
        <span style={{ fontWeight: 700, color }}>{Math.round(pct)}%</span>
      </div>
      <div style={{ height: 4, background: "var(--bg)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}
