"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import type { LaunchPlanRow } from "@/lib/db/plans";
import { deleteLaunchPlanAction, saveLaunchPlanAction } from "./actions";

const STAGES = [
  { k: "DRAFT", label: "Nháp", color: "chip-gray" },
  { k: "READY", label: "Sẵn sàng", color: "chip-blue" },
  { k: "LAUNCHED", label: "Đã launch", color: "chip-green" },
  { k: "POSTPONED", label: "Hoãn", color: "chip-amber" },
];

export default function LaunchPlanView({ rows }: { rows: LaunchPlanRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<LaunchPlanRow | "new" | null>(null);

  function del(id: string, name: string) {
    if (!confirm(`Xoá launch plan "${name}"?`)) return;
    startTransition(async () => {
      const r = await deleteLaunchPlanAction(id);
      if (!r.ok) alert(r.error);
      else router.refresh();
    });
  }

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">🚀 Launch sản phẩm</div>
          <div className="page-sub">{rows.length} kế hoạch ra mắt</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>+ Thêm plan</button>
      </div>

      {editing && (
        <EditForm
          initial={editing === "new" ? null : editing}
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
              <th>Stage</th>
              <th>Ngày launch</th>
              <th>Kênh</th>
              <th>Ghi chú</th>
              <th></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const stage = STAGES.find((s) => s.k === r.stage) || STAGES[0];
                return (
                  <tr key={r.id}>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{r.sku || "—"}</td>
                    <td style={{ fontWeight: 600 }}>{r.product_name || "—"}</td>
                    <td><span className={`chip ${stage.color}`}>{stage.label}</span></td>
                    <td className="muted" style={{ fontSize: 12 }}>{formatDate(r.launch_date)}</td>
                    <td className="muted" style={{ fontSize: 11 }}>{r.channels || "—"}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{r.note || "—"}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => setEditing(r)}>✏️</button>
                        <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }} onClick={() => del(r.id, r.product_name || r.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>Chưa có launch plan nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function EditForm({
  initial, onCancel, onSaved, disabled, startTransition,
}: {
  initial: LaunchPlanRow | null;
  onCancel: () => void;
  onSaved: () => void;
  disabled: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const [d, setD] = useState({
    sku: initial?.sku || "",
    product_name: initial?.product_name || "",
    stage: initial?.stage || "DRAFT",
    launch_date: initial?.launch_date ? String(initial.launch_date).substring(0, 10) : "",
    channels: initial?.channels || "",
    note: initial?.note || "",
  });

  function save() {
    if (!d.product_name.trim()) return alert("Nhập tên SP");
    startTransition(async () => {
      const r = await saveLaunchPlanAction(initial?.id || null, {
        sku: d.sku || null,
        product_name: d.product_name,
        stage: d.stage,
        launch_date: d.launch_date || null,
        channels: d.channels || null,
        note: d.note || null,
      });
      if (!r.ok) alert(r.error);
      else onSaved();
    });
  }

  return (
    <div className="card" style={{ marginBottom: 12, border: "1px solid var(--blue)" }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>{initial ? "Sửa launch plan" : "+ Launch plan mới"}</div>
      <div className="form-grid fg-3" style={{ marginBottom: 10 }}>
        <div className="form-group"><label>SKU</label><input value={d.sku} onChange={(e) => setD({ ...d, sku: e.target.value })} /></div>
        <div className="form-group"><label>Tên SP *</label><input value={d.product_name} onChange={(e) => setD({ ...d, product_name: e.target.value })} /></div>
        <div className="form-group">
          <label>Stage</label>
          <select value={d.stage} onChange={(e) => setD({ ...d, stage: e.target.value })}>
            {STAGES.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <div className="form-grid fg-2" style={{ marginBottom: 10 }}>
        <div className="form-group"><label>Ngày launch</label><input type="date" value={d.launch_date} onChange={(e) => setD({ ...d, launch_date: e.target.value })} /></div>
        <div className="form-group"><label>Kênh (CSV)</label><input value={d.channels} onChange={(e) => setD({ ...d, channels: e.target.value })} placeholder="Facebook,Shopee,TikTok" /></div>
      </div>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>Ghi chú</label>
        <textarea rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Huỷ</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={disabled}>💾 Lưu</button>
      </div>
    </div>
  );
}
