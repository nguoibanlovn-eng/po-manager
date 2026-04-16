"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatDate, formatVND, formatYmd, payClass, toNum } from "@/lib/format";
import type { Item, Order } from "@/lib/types";
import type { DamageItem } from "@/lib/db/finance";
import { updateDamageItemAction, updatePaymentAction } from "./actions";

const PAY_OPTIONS = ["Chưa thanh toán", "Đã cọc", "Đã thanh toán", "Công nợ"];
const RESOLUTION_TYPES = [
  { k: "refund", label: "Hoàn tiền" },
  { k: "replace", label: "Đổi hàng" },
  { k: "liquidate", label: "Thanh lý" },
  { k: "manual", label: "Ghi chú tay" },
];
const RESOLUTION_STATUS = [
  { k: "pending", label: "Đang chờ" },
  { k: "in_progress", label: "Đang xử lý" },
  { k: "done", label: "Đã xong" },
];

export default function FinanceView({
  tab,
  debtOrders,
  damagePending,
  damageDone,
}: {
  tab: "debt" | "damage";
  debtOrders: Order[];
  damagePending: DamageItem[];
  damageDone: DamageItem[];
}) {
  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">💰 Kế toán</div>
          <div className="page-sub">Công nợ và xử lý hàng hỏng</div>
        </div>
      </div>

      <div className="mini-tabs">
        <Link
          href="/finance?tab=debt"
          className={"mini-tab" + (tab === "debt" ? " active" : "")}
          style={{ textDecoration: "none" }}
        >
          💵 Công nợ <span className="cnt">{debtOrders.length}</span>
        </Link>
        <Link
          href="/finance?tab=damage"
          className={"mini-tab" + (tab === "damage" ? " active" : "")}
          style={{ textDecoration: "none" }}
        >
          ⚠ Xử lý hỏng <span className="cnt">{damagePending.length}</span>
        </Link>
      </div>

      {tab === "debt" ? (
        <DebtTable orders={debtOrders} />
      ) : (
        <DamageTable pending={damagePending} done={damageDone} />
      )}
    </section>
  );
}

function DebtTable({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, {
    pay_status: string;
    deposit_amount: string;
    payment_date: string;
    finance_note: string;
  }>>({});

  const totalDebt = orders.reduce((s, o) => s + toNum(o.order_total) - toNum(o.deposit_amount), 0);

  function startEdit(o: Order) {
    setEditing(o.order_id);
    setDraft({
      ...draft,
      [o.order_id]: {
        pay_status: String(o.pay_status || "Chưa thanh toán"),
        deposit_amount: String(o.deposit_amount || ""),
        payment_date: formatYmd(o.payment_date),
        finance_note: String(o.finance_note || ""),
      },
    });
  }

  function save(orderId: string) {
    const d = draft[orderId];
    if (!d) return;
    startTransition(async () => {
      const r = await updatePaymentAction(orderId, {
        pay_status: d.pay_status,
        deposit_amount: toNum(d.deposit_amount),
        payment_date: d.payment_date || null,
        finance_note: d.finance_note,
      });
      if (!r.ok) alert(r.error);
      else {
        setEditing(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", background: "#FAFAFA", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
        {orders.length} đơn chưa thanh toán đủ · Tổng còn nợ: <span style={{ color: "var(--red)" }}>{formatVND(totalDebt)}</span>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Tên / NCC</th>
              <th style={{ width: 100 }}>Ngày đặt</th>
              <th style={{ width: 140 }}>Trạng thái</th>
              <th style={{ width: 120 }} className="text-right">Tổng đơn</th>
              <th style={{ width: 120 }} className="text-right">Đã cọc</th>
              <th style={{ width: 120 }} className="text-right">Còn nợ</th>
              <th style={{ minWidth: 200 }}>Ghi chú</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const remaining = toNum(o.order_total) - toNum(o.deposit_amount);
              const isEditing = editing === o.order_id;
              const d = draft[o.order_id];
              return (
                <tr key={o.order_id}>
                  <td style={{ fontWeight: 700 }}>
                    <Link href={`/create?order_id=${o.order_id}`} style={{ color: "var(--blue)" }}>
                      {o.order_id}
                    </Link>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{o.order_name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{o.supplier_name || "—"}</div>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{formatDate(o.order_date)}</td>
                  <td>
                    {isEditing && d ? (
                      <select
                        value={d.pay_status}
                        onChange={(e) => setDraft({ ...draft, [o.order_id]: { ...d, pay_status: e.target.value } })}
                      >
                        {PAY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : (
                      <span className={`pay-badge ${payClass(o.pay_status)}`}>{o.pay_status || "—"}</span>
                    )}
                  </td>
                  <td className="text-right font-bold">{formatVND(o.order_total)}</td>
                  <td className="text-right">
                    {isEditing && d ? (
                      <input
                        className="text-right"
                        value={d.deposit_amount}
                        onChange={(e) =>
                          setDraft({ ...draft, [o.order_id]: { ...d, deposit_amount: e.target.value.replace(/\D/g, "") } })
                        }
                      />
                    ) : (
                      formatVND(o.deposit_amount)
                    )}
                  </td>
                  <td className="text-right" style={{ color: remaining > 0 ? "var(--red)" : "var(--green)", fontWeight: 700 }}>
                    {formatVND(remaining)}
                  </td>
                  <td>
                    {isEditing && d ? (
                      <input
                        value={d.finance_note}
                        onChange={(e) => setDraft({ ...draft, [o.order_id]: { ...d, finance_note: e.target.value } })}
                        placeholder="Ghi chú..."
                      />
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>{o.finance_note || "—"}</span>
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-primary btn-xs" onClick={() => save(o.order_id)} disabled={pending}>💾</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => setEditing(null)}>✕</button>
                      </div>
                    ) : (
                      <button className="btn btn-ghost btn-xs" onClick={() => startEdit(o)}>✏️</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: 24 }}>
                Không có công nợ.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DamageTable({ pending, done }: { pending: DamageItem[]; done: DamageItem[] }) {
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const list = tab === "pending" ? pending : done;

  return (
    <>
      <div className="mini-tabs">
        <button
          type="button"
          className={"mini-tab" + (tab === "pending" ? " active" : "")}
          onClick={() => setTab("pending")}
        >
          Đang xử lý <span className="cnt">{pending.length}</span>
        </button>
        <button
          type="button"
          className={"mini-tab" + (tab === "done" ? " active" : "")}
          onClick={() => setTab("done")}
        >
          Đã xong <span className="cnt">{done.length}</span>
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.length === 0 && (
          <div className="card muted" style={{ padding: 24, textAlign: "center" }}>
            {tab === "pending" ? "Không có hàng hỏng cần xử lý." : "Chưa có case nào xử lý xong."}
          </div>
        )}
        {list.map((it) => (
          <DamageRow key={`${it.order_id}-${it.line_id}`} item={it} />
        ))}
      </div>
    </>
  );
}

function DamageRow({ item }: { item: DamageItem }) {
  const router = useRouter();
  const [pendingTx, startTransition] = useTransition();
  const [d, setD] = useState({
    resolution_type: item.resolution_type || "refund",
    resolution_status: item.resolution_status || "pending",
    resolved_amount: String(item.resolved_amount || ""),
    resolved_date: formatYmd(item.resolved_date),
    replacement_bill_id: item.replacement_bill_id || "",
    liquidation_sku: item.liquidation_sku || "",
    damage_note: item.damage_note || "",
    refund_method: item.refund_method || "",
    finance_confirmed: !!item.finance_confirmed,
  });

  function save() {
    startTransition(async () => {
      const r = await updateDamageItemAction(item.order_id, item.line_id, {
        resolution_type: d.resolution_type,
        resolution_status: d.resolution_status,
        resolved_amount: toNum(d.resolved_amount),
        resolved_date: d.resolved_date || null,
        replacement_bill_id: d.replacement_bill_id || null,
        liquidation_sku: d.liquidation_sku || null,
        damage_note: d.damage_note || null,
        refund_method: d.refund_method || null,
        finance_confirmed: d.finance_confirmed,
      });
      if (!r.ok) alert(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 250px", minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{item.product_name}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            SKU: {item.sku || "—"} · Đơn:{" "}
            <Link href={`/create?order_id=${item.order_id}`} style={{ color: "var(--blue)" }}>
              {item.order_id}
            </Link>{" "}
            · NCC: {item.supplier_name || "—"}
          </div>
          <div style={{ marginTop: 6, fontSize: 12 }}>
            Hỏng <b style={{ color: "var(--red)" }}>{toNum(item.damage_qty)}/{toNum(item.qty)}</b> ·
            Thiệt hại <b style={{ color: "var(--red)" }}>{formatVND(item.damage_amount)}</b>
          </div>
        </div>
        {item.damage_handled && <span className="chip chip-green">Đã xử lý</span>}
      </div>

      <div className="form-grid fg-4" style={{ marginTop: 10 }}>
        <div className="form-group">
          <label>Loại xử lý</label>
          <select value={d.resolution_type} onChange={(e) => setD({ ...d, resolution_type: e.target.value })}>
            {RESOLUTION_TYPES.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Trạng thái</label>
          <select value={d.resolution_status} onChange={(e) => setD({ ...d, resolution_status: e.target.value })}>
            {RESOLUTION_STATUS.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Số tiền đã xử lý</label>
          <input
            type="text"
            inputMode="numeric"
            value={d.resolved_amount}
            onChange={(e) => setD({ ...d, resolved_amount: e.target.value.replace(/\D/g, "") })}
          />
        </div>
        <div className="form-group">
          <label>Ngày xử lý</label>
          <input type="date" value={d.resolved_date} onChange={(e) => setD({ ...d, resolved_date: e.target.value })} />
        </div>
      </div>

      <div className="form-grid fg-3" style={{ marginTop: 8 }}>
        {d.resolution_type === "refund" && (
          <div className="form-group">
            <label>Hình thức hoàn</label>
            <input
              value={d.refund_method}
              onChange={(e) => setD({ ...d, refund_method: e.target.value })}
              placeholder="CK / Tiền mặt..."
            />
          </div>
        )}
        {d.resolution_type === "replace" && (
          <div className="form-group">
            <label>Mã bill thay thế</label>
            <input
              value={d.replacement_bill_id}
              onChange={(e) => setD({ ...d, replacement_bill_id: e.target.value })}
            />
          </div>
        )}
        {d.resolution_type === "liquidate" && (
          <div className="form-group">
            <label>SKU thanh lý</label>
            <input value={d.liquidation_sku} onChange={(e) => setD({ ...d, liquidation_sku: e.target.value })} />
          </div>
        )}
        <div className="form-group" style={{ gridColumn: "span 2" }}>
          <label>Ghi chú</label>
          <input value={d.damage_note} onChange={(e) => setD({ ...d, damage_note: e.target.value })} />
        </div>
      </div>

      <div className="row" style={{ marginTop: 10, alignItems: "center", gap: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, textTransform: "none", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={d.finance_confirmed}
            onChange={(e) => setD({ ...d, finance_confirmed: e.target.checked })}
            style={{ width: 16, height: 16 }}
          />
          Kế toán xác nhận
        </label>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={save} disabled={pendingTx}>
          💾 Lưu
        </button>
      </div>
    </div>
  );
}
