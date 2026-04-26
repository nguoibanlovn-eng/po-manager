"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import { type RdItem, getSteps } from "@/lib/db/rd-types";
import type { UserRef } from "@/lib/db/users";
import type { SupplierRef } from "@/lib/db/suppliers";
import { deleteRdItemAction, saveRdItemAction, createBlankRdItemAction } from "./actions";
import RdDetailModal from "./RdDetailModal";

// Stage badges theo GAS gốc
const STAGE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  "Đề xuất":     { bg: "#EDE9FE", color: "#6D28D9", border: "#DDD6FE" },
  "Xác nhận":    { bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
  "Nghiên cứu":  { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" },
  "Duyệt NC":    { bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
  "Duyệt":       { bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
  "Đặt mẫu":     { bg: "#DCFCE7", color: "#15803D", border: "#86EFAC" },
  "Hàng về":     { bg: "#FFEDD5", color: "#C2410C", border: "#FED7AA" },
  "Kiểm tra":    { bg: "#FEF3C7", color: "#B45309", border: "#FCD34D" },
  "Nhập hàng":   { bg: "#F0FDF4", color: "#166534", border: "#86EFAC" },
  "Nhập?":       { bg: "#E0F2FE", color: "#0369A1", border: "#7DD3FC" },
  "Kết quả":     { bg: "#F0FDF4", color: "#166534", border: "#86EFAC" },
  "Loại bỏ":     { bg: "#FEE2E2", color: "#B91C1C", border: "#FECACA" },
  "Tạo ticket":  { bg: "#F4F4F5", color: "#52525B", border: "#D4D4D8" },
  "Tạo yêu cầu": { bg: "#EDE9FE", color: "#6D28D9", border: "#DDD6FE" },
  "Thiết kế":    { bg: "#F3E8FF", color: "#7E22CE", border: "#E9D5FF" },
  "NCC":         { bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
  "Nhận mẫu & QC": { bg: "#FFEDD5", color: "#C2410C", border: "#FED7AA" },
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

// Progress % theo stage — research workflow (8 bước)
const RESEARCH_STEPS = ["Đề xuất", "Xác nhận", "Nghiên cứu", "Duyệt NC", "Đặt mẫu", "Hàng về", "Duyệt mẫu", "Nhập hàng"];
const PRODUCTION_STEPS = [
  "Tạo yêu cầu", "Nghiên cứu", "Duyệt NC", "Đặt mẫu",
  "Chờ mẫu về", "Nhận mẫu & QC", "Duyệt mẫu", "Đặt hàng",
];

// Map stage tiếng Anh → tiếng Việt
const STAGE_ALIAS: Record<string, string> = {
  idea: "Đề xuất", new: "Đề xuất", propose: "Đề xuất",
  confirm: "Xác nhận", accept: "Xác nhận",
  research: "Nghiên cứu", researching: "Nghiên cứu",
  review: "Duyệt NC", approval: "Duyệt NC", pending: "Duyệt NC",
  sample: "Đặt mẫu", ordering: "Đặt mẫu",
  testing: "Hàng về", test: "Hàng về", qc: "Hàng về",
  done: "Nhập hàng", result: "Nhập hàng", approved: "Nhập hàng",
  rejected: "Loại bỏ", reject: "Loại bỏ", cancel: "Loại bỏ",
  design: "Thiết kế", supplier: "NCC+Tracking", ncc: "NCC+Tracking",
  production: "Đặt hàng",
};

function resolveStage(stage: string | null): string {
  if (!stage) return "";
  const lower = stage.toLowerCase().trim();
  if (STAGE_ALIAS[lower]) return STAGE_ALIAS[lower];
  // Try Vietnamese match
  for (const k of Object.keys(STAGE_STYLE)) {
    if (lower.includes(k.toLowerCase())) return k;
  }
  return stage;
}

function progressFor(stage: string | null, type: "research" | "production"): number {
  if (!stage) return 0;
  const resolved = resolveStage(stage);
  const steps = type === "production" ? PRODUCTION_STEPS : RESEARCH_STEPS;
  const idx = steps.findIndex((s) => resolved.toLowerCase().includes(s.toLowerCase()));
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / steps.length) * 100);
}

type Tab = "research" | "production";

export default function RdView({ items, users = [], suppliers = [], currentUserRole = "VIEWER", currentUserEmail = "" }: { items: RdItem[]; users?: UserRef[]; suppliers?: SupplierRef[]; filterStage?: string; currentUserRole?: string; currentUserEmail?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<RdItem | "new" | null>(null);
  const [detailItem, setDetailItem] = useState<RdItem | null>(null);
  const [tab, setTab] = useState<Tab>("research");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");

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

  // Filter
  const filtered = useMemo(() => {
    let list = activeItems;
    if (stageFilter) list = list.filter((it) => it.stage === stageFilter);
    if (assigneeFilter) list = list.filter((it) => {
      const d = (it.data as Record<string, unknown> | null) || {};
      const steps = getSteps(it);
      const activeStep = steps.find(s => s.status === "active");
      return String(d.assigned_name || activeStep?.assignee_name || "") === assigneeFilter;
    });
    if (priorityFilter) list = list.filter((it) => {
      const d = (it.data as Record<string, unknown> | null) || {};
      return String(d.priority || "normal") === priorityFilter;
    });
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((it) => (it.name || "").toLowerCase().includes(q));
    }
    return list;
  }, [activeItems, stageFilter, assigneeFilter, priorityFilter, search]);

  const allStages = useMemo(() => {
    const s = new Set<string>();
    activeItems.forEach((it) => { if (it.stage) s.add(it.stage); });
    return Array.from(s).sort();
  }, [activeItems]);

  const allAssignees = useMemo(() => {
    const s = new Set<string>();
    activeItems.forEach((it) => {
      const d = (it.data as Record<string, unknown> | null) || {};
      const steps = getSteps(it);
      const activeStep = steps.find(st => st.status === "active");
      const name = String(d.assigned_name || activeStep?.assignee_name || "");
      if (name) s.add(name);
    });
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
          <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => {
            startTransition(async () => {
              const rdType = tab === "production" ? "upgrade" : "research";
              const r = await createBlankRdItemAction(rdType);
              if (r.ok && r.item) { setDetailItem(r.item); router.refresh(); }
              else alert("Lỗi tạo SP");
            });
          }}>
            + Đề xuất SP
          </button>
        </div>
      </div>

      {/* 4 KPI cards — flat color */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <div style={{ padding: "12px 16px", background: "#FFFBEB", borderRadius: 8, border: "1px solid #FDE68A" }}>
          <div style={{ fontSize: 10, color: "#92400E", fontWeight: 600 }}>ĐANG NGHIÊN CỨU</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#D97706", margin: "2px 0" }}>{stats.researching}</div>
        </div>
        <div style={{ padding: "12px 16px", background: "#EFF6FF", borderRadius: 8, border: "1px solid #BFDBFE" }}>
          <div style={{ fontSize: 10, color: "#1E40AF", fontWeight: 600 }}>CHỜ DUYỆT</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#2563EB", margin: "2px 0" }}>{stats.pendingApproval}</div>
        </div>
        <div style={{ padding: "12px 16px", background: "#F0FDF4", borderRadius: 8, border: "1px solid #BBF7D0" }}>
          <div style={{ fontSize: 10, color: "#166534", fontWeight: 600 }}>NHẬP BÁN THÁNG NÀY</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#16A34A", margin: "2px 0" }}>{stats.imported}</div>
        </div>
        <div style={{ padding: "12px 16px", background: "#FEF2F2", borderRadius: 8, border: "1px solid #FECACA" }}>
          <div style={{ fontSize: 10, color: "#991B1B", fontWeight: 600 }}>LOẠI BỎ</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#DC2626", margin: "2px 0" }}>{stats.rejected}</div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder="Tìm sản phẩm..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 160, padding: "5px 10px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 11, outline: "none" }}
        />
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={{ fontSize: 11, padding: "5px 8px", border: "1px solid #E2E8F0", borderRadius: 6 }}>
          <option value="">Tất cả giai đoạn</option>
          {allStages.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} style={{ fontSize: 11, padding: "5px 8px", border: "1px solid #E2E8F0", borderRadius: 6 }}>
          <option value="">Tất cả người</option>
          {allAssignees.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={{ fontSize: 11, padding: "5px 8px", border: "1px solid #E2E8F0", borderRadius: 6 }}>
          <option value="">Tất cả ưu tiên</option>
          <option value="high">Ưu tiên cao</option>
          <option value="normal">Bình thường</option>
          <option value="low">Thấp</option>
        </select>
        {(stageFilter || assigneeFilter || priorityFilter || search) && (
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => { setStageFilter(""); setAssigneeFilter(""); setPriorityFilter(""); setSearch(""); }}>
            Xoá lọc
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#94A3B8" }}>{filtered.length}/{activeItems.length} SP</span>
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

      {/* Items table */}
      {filtered.length === 0 ? (
        <div className="card muted" style={{ padding: 24, textAlign: "center" }}>
          Không có SP nào trong tab này.
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="tbl-wrap" style={{ maxHeight: 500, overflowY: "auto" }}>
            <table>
              <thead><tr>
                <th style={{ width: 80 }}>Giai đoạn</th>
                <th>Sản phẩm</th>
                <th style={{ width: 200 }}>Tiến độ</th>
                <th style={{ width: 90 }}>Cập nhật</th>
                <th style={{ width: 60 }}></th>
              </tr></thead>
              <tbody>
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
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detailItem && (
        <RdDetailModal
          item={detailItem}
          users={users}
          suppliers={suppliers}
          currentUserRole={currentUserRole}
          currentUserEmail={currentUserEmail}
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

  // Progress thật từ steps JSON
  const steps = getSteps(item);
  const approvedCount = steps.filter((s) => s.status === "approved").length;
  const realProgress = steps.length > 0 ? Math.round((approvedCount / steps.length) * 100) : progress;

  function del() {
    if (!confirm(`Xoá "${item.name}"?`)) return;
    startTransition(async () => {
      const r = await deleteRdItemAction(item.id);
      if (!r.ok) alert(r.error);
      else refresh();
    });
  }

  const updatedDate = item.updated_at ? String(item.updated_at).substring(0, 10) : "—";
  const barColor = realProgress >= 80 ? "#22C55E" : realProgress >= 40 ? "#F59E0B" : realProgress > 0 ? "#3B82F6" : "#D1D5DB";
  const pipelineSteps = tab === "production" ? PRODUCTION_STEPS : RESEARCH_STEPS;
  // Derive current step from steps JSON (more accurate than stage field)
  const activeStepFromJson = steps.find((s) => s.status === "active");
  const lastApprovedIdx = steps.reduce((acc, s, i) => s.status === "approved" ? i : acc, -1);
  const derivedStepLabel = activeStepFromJson?.label || (lastApprovedIdx >= 0 && lastApprovedIdx + 1 < steps.length ? steps[lastApprovedIdx + 1]?.label : null) || item.stage || "Đề xuất";
  const currentStepIdx = steps.length > 0
    ? (activeStepFromJson ? steps.indexOf(activeStepFromJson) : lastApprovedIdx + 1)
    : pipelineSteps.findIndex((s) => (item.stage || "").toLowerCase().includes(s.toLowerCase()));
  const currentStep = derivedStepLabel;

  // Tags info
  const assignedName = String(data.assigned_name || activeStepFromJson?.assignee_name || "");
  const priority = String(data.priority || "");
  const deadline = activeStepFromJson?.deadline || "";
  const isOverdue = deadline && new Date(deadline) < new Date(new Date().toISOString().split("T")[0]);

  return (
    <tr onClick={onOpen} style={{ cursor: "pointer" }}>
      <td>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4,
          background: style.bg, color: style.color, border: `1px solid ${style.border}`,
          whiteSpace: "nowrap",
        }}>
          {item.stage || "Đề xuất"}
        </span>
      </td>
      <td>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{item.name || "(không tên)"}</div>
        {description && (
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 340 }}>
            {description}
          </div>
        )}
        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
          {assignedName && (
            <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "#EFF6FF", color: "#1D4ED8" }}>
              {assignedName}
            </span>
          )}
          {priority === "high" && (
            <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "#FEF2F2", color: "#DC2626" }}>
              Ưu tiên cao
            </span>
          )}
          {priority === "low" && (
            <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "#F4F4F5", color: "#71717A" }}>
              Thấp
            </span>
          )}
          {deadline && (
            <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: isOverdue ? "#FEE2E2" : "#F0FDF4", color: isOverdue ? "#DC2626" : "#16A34A" }}>
              {isOverdue ? "QUÁ HẠN " : "DL: "}{deadline.substring(5)}
            </span>
          )}
        </div>
      </td>
      <td>
        <div style={{ display: "flex", gap: 2, alignItems: "center", marginBottom: 3 }}>
          {pipelineSteps.map((s, si) => {
            const done = si < (currentStepIdx >= 0 ? currentStepIdx : -1);
            const active = si === currentStepIdx;
            return (
              <div key={s} title={s} style={{
                flex: 1, height: 6, borderRadius: 3,
                background: done ? barColor : active ? barColor : "#E5E7EB",
                opacity: active ? 1 : done ? 0.5 : 0.3,
              }} />
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: "#6B7280" }}>
          {currentStep ? (
            <><span style={{ fontWeight: 600, color: barColor }}>Bước {(currentStepIdx || 0) + 1}/{steps.length || pipelineSteps.length}</span> · {currentStep}</>
          ) : (
            <span style={{ color: "#D1D5DB" }}>Chưa bắt đầu</span>
          )}
        </div>
      </td>
      <td style={{ fontSize: 11, color: "#9CA3AF" }}>{updatedDate}</td>
      <td>
        <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onEdit} disabled={disabled} title="Sửa">✏️</button>
          <button type="button" className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }} onClick={del}
          disabled={disabled}
        >
            🗑
          </button>
        </div>
      </td>
    </tr>
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
