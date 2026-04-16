"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatDate, formatVND, toNum } from "@/lib/format";
import type { Item, OrderListItem } from "@/lib/types";
import { confirmShelfAction, saveQcAction } from "./actions";

const QC_OPTIONS = ["Chưa QC", "Đang QC", "Đã QC xong", "Lỗi NCC"];
const RET_OPTIONS = ["Chưa xử lý", "Đã liên hệ NCC", "Đã hoàn cọc", "Đã hoàn tiền", "Hoàn tất"];

type Tab = "active" | "done";

type EditableItem = Item & { _dirty?: boolean };

export default function TechView({
  orders,
  itemsByOrder,
  activeTab,
}: {
  orders: OrderListItem[];
  itemsByOrder: Record<string, Item[]>;
  activeTab: Tab;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">⚙️ QC &amp; Lên kệ</div>
          <div className="page-sub">{orders.length} đơn</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => router.refresh()}>🔄</button>
      </div>

      <div className="mini-tabs">
        <Link
          href="/tech?tab=active"
          className={"mini-tab" + (activeTab === "active" ? " active" : "")}
          style={{ textDecoration: "none" }}
        >
          ⏳ Đang xử lý
        </Link>
        <Link
          href="/tech?tab=done"
          className={"mini-tab" + (activeTab === "done" ? " active" : "")}
          style={{ textDecoration: "none" }}
        >
          ✅ Đã hoàn thành
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="card muted" style={{ padding: 24, textAlign: "center" }}>
          {activeTab === "active" ? "Không có đơn nào đang chờ QC." : "Chưa có đơn hoàn thành."}
        </div>
      ) : (
        orders.map((o) => (
          <OrderQcCard
            key={o.order_id}
            order={o}
            initialItems={itemsByOrder[o.order_id] || []}
            disabled={pending}
            onSaved={() => router.refresh()}
            startTransition={startTransition}
          />
        ))
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
  const [expanded, setExpanded] = useState(order.stage === "ARRIVED");
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

  return (
    <div className="card" style={{ marginBottom: 12, padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "#FAFAFA",
          borderBottom: expanded ? "1px solid var(--border)" : "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>
            {order.order_id} · {order.order_name || "—"}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {order.supplier_name || "—"} · Về ngày {formatDate(order.arrival_date)} · {items.length} SP ·
            QC {qcDoneCount}/{items.length} · Kệ {shelfDoneCount}/{items.length}
          </div>
        </div>
        <span className={`stage-badge stage-${order.stage}`}>{order.stage}</span>
        <span style={{ color: "var(--muted)" }}>{expanded ? "▾" : "▸"}</span>
      </div>

      {expanded && (
        <div style={{ padding: 14 }}>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>SP</th>
                  <th style={{ width: 60 }} className="text-right">SL</th>
                  <th style={{ width: 130 }}>QC</th>
                  <th style={{ width: 80 }} className="text-right">Hỏng SL</th>
                  <th style={{ width: 110 }} className="text-right">Tiền hỏng</th>
                  <th style={{ minWidth: 150 }}>Ghi chú</th>
                  <th style={{ width: 70 }} className="text-center">Lên kệ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.line_id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{it.product_name}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{it.sku || "—"}</div>
                    </td>
                    <td className="text-right">{toNum(it.qty)}</td>
                    <td>
                      <select
                        value={it.qc_status || "Chưa QC"}
                        onChange={(e) => patch(it.line_id, { qc_status: e.target.value })}
                        disabled={disabled}
                      >
                        {QC_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td className="text-right">
                      <input
                        className="text-right"
                        type="text"
                        inputMode="numeric"
                        value={String(it.damage_qty ?? 0)}
                        onChange={(e) =>
                          patch(it.line_id, { damage_qty: Number(e.target.value.replace(/\D/g, "")) })
                        }
                        disabled={disabled}
                      />
                    </td>
                    <td className="text-right">
                      <input
                        className="text-right"
                        type="text"
                        inputMode="numeric"
                        value={String(it.damage_amount ?? 0)}
                        onChange={(e) =>
                          patch(it.line_id, { damage_amount: Number(e.target.value.replace(/\D/g, "")) })
                        }
                        disabled={disabled}
                      />
                    </td>
                    <td>
                      <input
                        value={it.damage_note || ""}
                        onChange={(e) => patch(it.line_id, { damage_note: e.target.value })}
                        placeholder="Ghi chú hỏng..."
                        disabled={disabled}
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={!!it.shelf_done}
                        onChange={(e) => patch(it.line_id, { shelf_done: e.target.checked })}
                        disabled={disabled}
                        style={{ width: 18, height: 18 }}
                      />
                    </td>
                  </tr>
                ))}
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
