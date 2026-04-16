"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import type { RdItem } from "@/lib/db/rd";
import { deleteRdItemAction, saveRdItemAction, updateStageAction } from "./actions";

const STAGES = [
  { k: "IDEA", label: "Ý tưởng", color: "#9CA3AF" },
  { k: "FETCHED", label: "Đã fetch", color: "#3B82F6" },
  { k: "ANALYZING", label: "Đang phân tích", color: "#F59E0B" },
  { k: "READY", label: "Sẵn sàng triển khai", color: "#10B981" },
  { k: "DROPPED", label: "Bỏ", color: "#EF4444" },
];

const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.k, s.label]));

export default function RdView({ items, filterStage }: { items: RdItem[]; filterStage: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<RdItem | "new" | null>(null);

  const filtered = filterStage ? items.filter((i) => i.stage === filterStage) : items;

  const countByStage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of items) m[it.stage || "IDEA"] = (m[it.stage || "IDEA"] || 0) + 1;
    return m;
  }, [items]);

  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">💡 R&amp;D Sản phẩm</div>
          <div className="page-sub">{items.length} ý tưởng / dự án nghiên cứu</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>+ Thêm ý tưởng</button>
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        <Link href="/rd" className={"btn btn-sm " + (filterStage === "" ? "btn-primary" : "btn-ghost")} style={{ textDecoration: "none" }}>
          Tất cả ({items.length})
        </Link>
        {STAGES.map((s) => (
          <Link
            key={s.k}
            href={`/rd?stage=${s.k}`}
            className={"btn btn-sm " + (filterStage === s.k ? "btn-primary" : "btn-ghost")}
            style={{ textDecoration: "none" }}
          >
            {s.label} ({countByStage[s.k] || 0})
          </Link>
        ))}
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

      {filtered.length === 0 ? (
        <div className="card muted" style={{ padding: 24, textAlign: "center" }}>
          Không có ý tưởng nào.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {filtered.map((it) => (
            <RdCard
              key={it.id}
              item={it}
              onEdit={() => setEditing(it)}
              disabled={pending}
              startTransition={startTransition}
              refresh={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RdCard({
  item,
  onEdit,
  disabled,
  startTransition,
  refresh,
}: {
  item: RdItem;
  onEdit: () => void;
  disabled: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
  refresh: () => void;
}) {
  const stage = STAGES.find((s) => s.k === item.stage) || STAGES[0];
  const data = item.data || {};
  const priceSell = Number((data as Record<string, unknown>).price_sell || 0);
  const priceBuy = Number((data as Record<string, unknown>).price_buy || 0);
  const star = Number((data as Record<string, unknown>).star || 0);
  const description = String((data as Record<string, unknown>).description || "").substring(0, 140);
  const proposerName = String((data as Record<string, unknown>).proposer_name || item.created_by || "");

  function changeStage(newStage: string) {
    startTransition(async () => {
      await updateStageAction(item.id, newStage);
      refresh();
    });
  }

  function del() {
    if (!confirm(`Xoá "${item.name}"?`)) return;
    startTransition(async () => {
      const r = await deleteRdItemAction(item.id);
      if (!r.ok) alert(r.error);
      else refresh();
    });
  }

  return (
    <div className="card" style={{ padding: 0, borderLeft: `4px solid ${stage.color}` }}>
      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{item.name || "(không tên)"}</div>
          <span className="chip" style={{ background: stage.color + "20", color: stage.color, borderColor: stage.color + "40" }}>
            {stage.label}
          </span>
        </div>
        {star > 0 && (
          <div style={{ marginTop: 4, fontSize: 12 }}>
            {"⭐".repeat(Math.min(5, star))}
          </div>
        )}
        {description && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {description}{description.length >= 140 ? "..." : ""}
          </div>
        )}
        {(priceSell > 0 || priceBuy > 0) && (
          <div style={{ marginTop: 8, display: "flex", gap: 12, fontSize: 12 }}>
            {priceBuy > 0 && <span className="muted">Nhập: <b>{priceBuy.toLocaleString("vi-VN")}₫</b></span>}
            {priceSell > 0 && <span>Bán: <b style={{ color: "var(--green)" }}>{priceSell.toLocaleString("vi-VN")}₫</b></span>}
          </div>
        )}
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          {proposerName && <span>👤 {proposerName}</span>}
          {item.updated_at && <span style={{ marginLeft: 8 }}>⏱ {formatDate(item.updated_at)}</span>}
        </div>
        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--blue)", display: "block", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            🔗 {item.source_url}
          </a>
        )}
      </div>

      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", background: "#FAFAFA", display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={item.stage || "IDEA"}
          onChange={(e) => changeStage(e.target.value)}
          disabled={disabled}
          style={{ padding: "3px 6px", fontSize: 11, flex: 1, minWidth: 0 }}
        >
          {STAGES.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}
        </select>
        <button className="btn btn-ghost btn-xs" onClick={onEdit}>✏️</button>
        <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }} onClick={del} disabled={disabled}>🗑</button>
      </div>
    </div>
  );
}

function EditForm({
  initial,
  onCancel,
  onSaved,
  disabled,
  startTransition,
}: {
  initial: RdItem | null;
  onCancel: () => void;
  onSaved: () => void;
  disabled: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const initialData = initial?.data || {};
  const [d, setD] = useState({
    name: initial?.name || "",
    source_url: initial?.source_url || "",
    stage: initial?.stage || "IDEA",
    note: initial?.note || "",
    description: String((initialData as Record<string, unknown>).description || ""),
    price_sell: String((initialData as Record<string, unknown>).price_sell || ""),
    price_buy: String((initialData as Record<string, unknown>).price_buy || ""),
    star: Number((initialData as Record<string, unknown>).star || 0),
    proposer_name: String((initialData as Record<string, unknown>).proposer_name || ""),
  });

  function save() {
    if (!d.name.trim()) return alert("Nhập tên SP");
    startTransition(async () => {
      const r = await saveRdItemAction(initial?.id || null, {
        name: d.name,
        source_url: d.source_url || null,
        stage: d.stage,
        note: d.note || null,
        data: {
          ...initialData,
          description: d.description,
          price_sell: Number(d.price_sell) || 0,
          price_buy: Number(d.price_buy) || 0,
          star: Number(d.star) || 0,
          proposer_name: d.proposer_name,
        },
      });
      if (!r.ok) alert(r.error);
      else onSaved();
    });
  }

  return (
    <div className="card" style={{ marginBottom: 12, border: "1px solid var(--blue)" }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>
        {initial ? `Sửa: ${initial.name}` : "+ Ý tưởng mới"}
      </div>
      <div className="form-grid fg-2" style={{ marginBottom: 10 }}>
        <div className="form-group">
          <label>Tên SP *</label>
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Link tham khảo</label>
          <input value={d.source_url} onChange={(e) => setD({ ...d, source_url: e.target.value })} placeholder="https://..." />
        </div>
      </div>
      <div className="form-grid fg-4" style={{ marginBottom: 10 }}>
        <div className="form-group">
          <label>Stage</label>
          <select value={d.stage} onChange={(e) => setD({ ...d, stage: e.target.value })}>
            {STAGES.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Giá nhập dự kiến</label>
          <input type="text" inputMode="numeric" value={d.price_buy} onChange={(e) => setD({ ...d, price_buy: e.target.value.replace(/\D/g, "") })} />
        </div>
        <div className="form-group">
          <label>Giá bán dự kiến</label>
          <input type="text" inputMode="numeric" value={d.price_sell} onChange={(e) => setD({ ...d, price_sell: e.target.value.replace(/\D/g, "") })} />
        </div>
        <div className="form-group">
          <label>⭐ Sao (0-5)</label>
          <input type="number" min={0} max={5} value={d.star} onChange={(e) => setD({ ...d, star: Number(e.target.value) })} />
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>Mô tả</label>
        <textarea rows={3} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </div>
      <div className="form-grid fg-2" style={{ marginBottom: 10 }}>
        <div className="form-group">
          <label>Người đề xuất</label>
          <input value={d.proposer_name} onChange={(e) => setD({ ...d, proposer_name: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Ghi chú</label>
          <input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Huỷ</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={disabled}>💾 Lưu</button>
      </div>
    </div>
  );
}

// Re-export STAGE_LABEL for potential external use
export { STAGE_LABEL };
