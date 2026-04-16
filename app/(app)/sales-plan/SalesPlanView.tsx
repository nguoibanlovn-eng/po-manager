"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatVND, toNum } from "@/lib/format";
import type { SalesPlanRow } from "@/lib/db/plans";
import { deleteSalesPlanAction, saveSalesPlanAction } from "./actions";

const CHANNELS = ["Facebook", "TikTok", "Shopee", "Web", "Khác"];

export default function SalesPlanView({
  rows,
  monthKey,
}: {
  rows: SalesPlanRow[];
  monthKey: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<SalesPlanRow | "new" | null>(null);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        qty: acc.qty + toNum(r.qty_target),
        rev: acc.rev + toNum(r.rev_target),
      }),
      { qty: 0, rev: 0 },
    );
  }, [rows]);

  function changeMonth(m: string) {
    router.push(`/sales-plan?month=${m}`);
  }

  function del(id: string, name: string) {
    if (!confirm(`Xoá kế hoạch cho "${name}"?`)) return;
    startTransition(async () => {
      const r = await deleteSalesPlanAction(id);
      if (!r.ok) alert(r.error);
      else router.refresh();
    });
  }

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">📈 Kế hoạch bán hàng</div>
          <div className="page-sub">{rows.length} SP · Mục tiêu: {formatVND(totals.rev)} / {totals.qty.toLocaleString("vi-VN")} sp</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <input type="month" value={monthKey} onChange={(e) => changeMonth(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>+ Thêm KH</button>
        </div>
      </div>

      {editing && (
        <EditForm
          initial={editing === "new" ? null : editing}
          defaultMonth={monthKey}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
          disabled={pending}
          startTransition={startTransition}
        />
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>SKU</th>
              <th>SP</th>
              <th>Kênh</th>
              <th className="text-right">Mục tiêu SL</th>
              <th className="text-right">Mục tiêu DT</th>
              <th>Status</th>
              <th>Ghi chú</th>
              <th></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>{r.sku || "—"}</td>
                  <td>{r.product_name || "—"}</td>
                  <td><span className="chip chip-blue">{r.channel || "—"}</span></td>
                  <td className="text-right">{toNum(r.qty_target).toLocaleString("vi-VN")}</td>
                  <td className="text-right font-bold">{formatVND(r.rev_target)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.status || "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.note || "—"}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => setEditing(r)}>✏️</button>
                      <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }} onClick={() => del(r.id, r.product_name || r.sku || r.id)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>Chưa có kế hoạch cho tháng này.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function EditForm({
  initial, defaultMonth, onCancel, onSaved, disabled, startTransition,
}: {
  initial: SalesPlanRow | null;
  defaultMonth: string;
  onCancel: () => void;
  onSaved: () => void;
  disabled: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const [d, setD] = useState({
    sku: initial?.sku || "",
    product_name: initial?.product_name || "",
    month_key: initial?.month_key || defaultMonth,
    channel: initial?.channel || "Facebook",
    qty_target: String(initial?.qty_target || ""),
    rev_target: String(initial?.rev_target || ""),
    status: initial?.status || "ACTIVE",
    note: initial?.note || "",
  });

  function save() {
    if (!d.product_name.trim()) return alert("Nhập tên SP");
    startTransition(async () => {
      const r = await saveSalesPlanAction(initial?.id || null, {
        sku: d.sku || null,
        product_name: d.product_name,
        month_key: d.month_key,
        channel: d.channel,
        qty_target: toNum(d.qty_target),
        rev_target: toNum(d.rev_target),
        status: d.status,
        note: d.note || null,
      });
      if (!r.ok) alert(r.error);
      else onSaved();
    });
  }

  return (
    <div className="card" style={{ marginBottom: 12, border: "1px solid var(--blue)" }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>{initial ? "Sửa kế hoạch" : "+ Kế hoạch mới"}</div>
      <div className="form-grid fg-3" style={{ marginBottom: 10 }}>
        <div className="form-group"><label>SKU</label><input value={d.sku} onChange={(e) => setD({ ...d, sku: e.target.value })} /></div>
        <div className="form-group"><label>Tên SP *</label><input value={d.product_name} onChange={(e) => setD({ ...d, product_name: e.target.value })} /></div>
        <div className="form-group"><label>Tháng</label><input type="month" value={d.month_key} onChange={(e) => setD({ ...d, month_key: e.target.value })} /></div>
      </div>
      <div className="form-grid fg-4" style={{ marginBottom: 10 }}>
        <div className="form-group">
          <label>Kênh</label>
          <select value={d.channel} onChange={(e) => setD({ ...d, channel: e.target.value })}>
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Mục tiêu SL</label><input type="text" inputMode="numeric" value={d.qty_target} onChange={(e) => setD({ ...d, qty_target: e.target.value.replace(/\D/g, "") })} /></div>
        <div className="form-group"><label>Mục tiêu DT</label><input type="text" inputMode="numeric" value={d.rev_target} onChange={(e) => setD({ ...d, rev_target: e.target.value.replace(/\D/g, "") })} /></div>
        <div className="form-group">
          <label>Status</label>
          <select value={d.status} onChange={(e) => setD({ ...d, status: e.target.value })}>
            <option value="ACTIVE">Đang chạy</option>
            <option value="PAUSED">Tạm dừng</option>
            <option value="DONE">Hoàn tất</option>
          </select>
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>Ghi chú</label>
        <input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Huỷ</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={disabled}>💾 Lưu</button>
      </div>
    </div>
  );
}
