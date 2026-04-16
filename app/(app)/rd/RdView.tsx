"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import type { RdItem } from "@/lib/db/rd-types";
import { deleteRdItemAction, saveRdItemAction } from "./actions";
import RdDetailModal from "./RdDetailModal";

// Stage badges theo GAS gốc
const STAGE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  "Đề xuất":     { bg: "#EDE9FE", color: "#6D28D9", border: "#DDD6FE" },
  "Nghiên cứu":  { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" },
  "Duyệt":       { bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
  "Đặt mẫu":     { bg: "#DCFCE7", color: "#15803D", border: "#86EFAC" },
  "Kiểm tra":    { bg: "#FEF3C7", color: "#B45309", border: "#FCD34D" },
  "Nhập?":       { bg: "#E0F2FE", color: "#0369A1", border: "#7DD3FC" },
  "Kết quả":     { bg: "#F0FDF4", color: "#166534", border: "#86EFAC" },
  "Loại bỏ":     { bg: "#FEE2E2", color: "#B91C1C", border: "#FECACA" },
  "Tạo ticket":  { bg: "#F4F4F5", color: "#52525B", border: "#D4D4D8" },
  "Thiết kế":    { bg: "#F3E8FF", color: "#7E22CE", border: "#E9D5FF" },
  "NCC":         { bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
  "Chờ mẫu về":  { bg: "#FFEDD5", color: "#C2410C", border: "#FED7AA" },
  "Duyệt mẫu":   { bg: "#DCFCE7", color: "#15803D", border: "#86EFAC" },
  "Đặt hàng":    { bg: "#F0FDF4", color: "#166534", border: "#86EFAC" },
};

function stageStyleFor(stage: string | null | undefined) {
  if (!stage) return STAGE_STYLE["Đề xuất"];
  // Exact match
  if (STAGE_STYLE[stage]) return STAGE_STYLE[stage];
  // Partial match (case insensitive)
  const lower = stage.toLowerCase();
  for (const k of Object.keys(STAGE_STYLE)) {
    if (lower.includes(k.toLowerCase())) return STAGE_STYLE[k];
  }
  return { bg: "#F4F4F5", color: "#52525B", border: "#D4D4D8" };
}

// Progress % theo stage — research workflow (6 bước)
const RESEARCH_STEPS = ["Giao việc", "Nghiên cứu", "Duyệt", "Đặt mẫu", "Kiểm tra", "Kết quả"];
const PRODUCTION_STEPS = [
  "Tạo ticket", "Nghiên cứu", "Duyệt B1", "Giao TK", "Thiết kế",
  "Duyệt 2A", "NCC+Tracking", "Chờ mẫu về", "Duyệt mẫu", "Đặt hàng",
];

function progressFor(stage: string | null, type: "research" | "production"): number {
  if (!stage) return 0;
  const steps = type === "production" ? PRODUCTION_STEPS : RESEARCH_STEPS;
  const idx = steps.findIndex((s) => stage.toLowerCase().includes(s.toLowerCase()));
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / steps.length) * 100);
}

type Tab = "research" | "production";

export default function RdView({ items }: { items: RdItem[]; filterStage?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<RdItem | "new" | null>(null);
  const [detailItem, setDetailItem] = useState<RdItem | null>(null);
  const [tab, setTab] = useState<Tab>("research");
  const [stageFilter, setStageFilter] = useState<string>("");

  // Phân loại item theo rd_type trong data
  const { researchItems, productionItems } = useMemo(() => {
    const r: RdItem[] = [];
    const p: RdItem[] = [];
    for (const it of items) {
      const rdType = String((it.data as Record<string, unknown> | null)?.rd_type || "").toLowerCase();
      if (rdType === "upgrade" || rdType === "production" || rdType === "mfg") p.push(it);
      else r.push(it);
    }
    return { researchItems: r, productionItems: p };
  }, [items]);

  const activeItems = tab === "research" ? researchItems : productionItems;

  // Filter theo stage dropdown
  const filtered = useMemo(() => {
    if (!stageFilter) return activeItems;
    return activeItems.filter((it) => it.stage === stageFilter);
  }, [activeItems, stageFilter]);

  const allStages = useMemo(() => {
    const s = new Set<string>();
    activeItems.forEach((it) => { if (it.stage) s.add(it.stage); });
    return Array.from(s).sort();
  }, [activeItems]);

  // 4 KPI stats
  const stats = useMemo(() => {
    let researching = 0, pendingApproval = 0, imported = 0, rejected = 0;
    const thisMonth = new Date().toISOString().substring(0, 7);
    for (const it of activeItems) {
      const s = String(it.stage || "").toLowerCase();
      if (s.includes("loại bỏ") || s.includes("loại")) rejected++;
      else if (s.includes("duyệt") && !s.includes("duyệt mẫu")) pendingApproval++;
      else if (s.includes("kết quả") || s.includes("đặt hàng")) {
        const updated = String(it.updated_at || "").substring(0, 7);
        if (updated === thisMonth) imported++;
      } else researching++;
    }
    return { researching, pendingApproval, imported, rejected };
  }, [activeItems]);

  return (
    <section className="section">
      <div className="page-hdr">
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div className="page-title" style={{ marginRight: 4 }}>R&amp;D</div>

          {/* Tabs */}
          <div className="mini-tabs" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={"mini-tab" + (tab === "research" ? " active" : "")}
              onClick={() => setTab("research")}
            >
              Nghiên cứu SP
            </button>
            <button
              type="button"
              className={"mini-tab" + (tab === "production" ? " active" : "")}
              onClick={() => setTab("production")}
            >
              Sản xuất / Thiết kế
            </button>
          </div>

          <div className="page-sub" style={{ marginLeft: 8 }}>
            {activeItems.length} sản phẩm đang theo dõi
          </div>
        </div>

        <div className="row" style={{ gap: 6 }}>
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="">Tất cả giai đoạn</option>
            {allStages.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" className="btn btn-ghost btn-sm">? Hướng dẫn</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
            + Đề xuất SP
          </button>
        </div>
      </div>

      {/* 4 KPI cards */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <div className="stat-card c-amber">
          <div className="sl">Đang nghiên cứu</div>
          <div className="sv">{stats.researching}</div>
        </div>
        <div className="stat-card c-blue">
          <div className="sl">Chờ duyệt</div>
          <div className="sv">{stats.pendingApproval}</div>
        </div>
        <div className="stat-card c-green">
          <div className="sl">Nhập bán tháng này</div>
          <div className="sv">{stats.imported}</div>
        </div>
        <div className="stat-card c-red">
          <div className="sl">Loại bỏ</div>
          <div className="sv">{stats.rejected}</div>
        </div>
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

      {/* Items list */}
      {filtered.length === 0 ? (
        <div className="card muted" style={{ padding: 24, textAlign: "center" }}>
          Không có SP nào trong tab này.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((it) => (
            <RdRow
              key={it.id}
              item={it}
              tab={tab}
              onOpen={() => setDetailItem(it)}
              onEdit={() => setEditing(it)}
              disabled={pending}
              startTransition={startTransition}
              refresh={() => router.refresh()}
            />
          ))}
        </div>
      )}

      {detailItem && (
        <RdDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onRefresh={() => router.refresh()}
        />
      )}
    </section>
  );
}

function RdRow({
  item,
  tab,
  onOpen,
  onEdit,
  disabled,
  startTransition,
  refresh,
}: {
  item: RdItem;
  tab: Tab;
  onOpen: () => void;
  onEdit: () => void;
  disabled: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
  refresh: () => void;
}) {
  const style = stageStyleFor(item.stage);
  const progress = progressFor(item.stage, tab);
  const data = (item.data as Record<string, unknown> | null) || {};
  const description = String(data.description || data.note_short || item.note || "").substring(0, 140);

  // Progress thật từ step_completed_at nếu có
  const completed = item.step_completed_at || {};
  const pipelineLen = tab === "production" ? 10 : 6;
  const completedCount = Object.keys(completed).length;
  const realProgress = completedCount > 0 ? Math.round((completedCount / pipelineLen) * 100) : progress;

  function del() {
    if (!confirm(`Xoá "${item.name}"?`)) return;
    startTransition(async () => {
      const r = await deleteRdItemAction(item.id);
      if (!r.ok) alert(r.error);
      else refresh();
    });
  }

  return (
    <div
      className="card"
      style={{
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        cursor: "pointer",
      }}
      onClick={onOpen}
    >
      <span
        className="chip"
        style={{
          background: style.bg,
          color: style.color,
          borderColor: style.border,
          flexShrink: 0,
          fontSize: 10,
          padding: "3px 8px",
        }}
      >
        {item.stage || "Đề xuất"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name || "(không tên)"}</div>
        {description && (
          <div className="muted" style={{ fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {description}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: realProgress >= 80 ? "var(--green)" : realProgress >= 40 ? "var(--amber)" : "var(--subtle)", minWidth: 40, textAlign: "right" }}>
          {realProgress}%
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          disabled={disabled}
          title="Sửa info cơ bản"
        >
          ✏️
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          style={{ color: "var(--red)" }}
          onClick={(e) => { e.stopPropagation(); del(); }}
          disabled={disabled}
        >
          🗑
        </button>
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
  const initialData = (initial?.data as Record<string, unknown> | null) || {};
  const [d, setD] = useState({
    name: initial?.name || "",
    source_url: initial?.source_url || "",
    stage: initial?.stage || "Đề xuất",
    note: initial?.note || "",
    description: String(initialData.description || ""),
    price_sell: String(initialData.price_sell || ""),
    price_buy: String(initialData.price_buy || ""),
    star: Number(initialData.star || 0),
    proposer_name: String(initialData.proposer_name || ""),
    rd_type: String(initialData.rd_type || "research"),
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
          rd_type: d.rd_type,
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
        {initial ? `Sửa: ${initial.name}` : "+ Đề xuất SP mới"}
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
          <label>Loại R&amp;D</label>
          <select value={d.rd_type} onChange={(e) => setD({ ...d, rd_type: e.target.value })}>
            <option value="research">Nghiên cứu SP</option>
            <option value="upgrade">Sản xuất / Thiết kế</option>
          </select>
        </div>
        <div className="form-group">
          <label>Giai đoạn</label>
          <input value={d.stage} onChange={(e) => setD({ ...d, stage: e.target.value })} placeholder="VD: Đề xuất" />
        </div>
        <div className="form-group">
          <label>Giá nhập dự kiến</label>
          <input type="text" inputMode="numeric" value={d.price_buy} onChange={(e) => setD({ ...d, price_buy: e.target.value.replace(/\D/g, "") })} />
        </div>
        <div className="form-group">
          <label>Giá bán dự kiến</label>
          <input type="text" inputMode="numeric" value={d.price_sell} onChange={(e) => setD({ ...d, price_sell: e.target.value.replace(/\D/g, "") })} />
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
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Huỷ</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={disabled}>
          💾 Lưu
        </button>
      </div>
    </div>
  );
}
