"use client";

import { useState, useTransition } from "react";
import {
  getSteps, getStepsKey, isProduction, getLinkUrl, getLinkTag,
  type RdItem, type RdStep, type RdCheckItem, type RdLink,
} from "@/lib/db/rd-types";
import type { UserRef } from "@/lib/db/users";
import { saveRdItemAction, createPoFromRdAction } from "./actions";

/* ─── Field definitions per step label ──────────────────── */
type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "url" | "number" | "date" | "verdict";
};

const VERDICT_OPTIONS = ["Duyệt", "Từ chối", "Cần chỉnh sửa"];

const STEP_FORM_FIELDS: Record<string, FieldDef[]> = {
  "Đề xuất": [
    { key: "description",       label: "Mô tả sản phẩm", type: "textarea" },
    { key: "reason",            label: "Lý do đề xuất", type: "textarea" },
    { key: "ref_links",         label: "Link tham khảo (1688, Shopee...)", type: "url" },
  ],
  "Xác nhận": [
    { key: "confirm_note",      label: "Ghi chú", type: "textarea" },
  ],
  "Nghiên cứu": [
    { key: "usp",               label: "Phân tích USP", type: "textarea" },
    { key: "competitors",       label: "Đối thủ / SP cùng loại", type: "textarea" },
    { key: "market_price",      label: "Giá thị trường" },
    { key: "market_volume",     label: "Volume thị trường" },
    { key: "supplier_name",     label: "NCC dự kiến" },
    { key: "supplier_trust",    label: "Uy tín NCC" },
    { key: "moq",               label: "MOQ" },
    { key: "price_buy",         label: "Giá nhập dự kiến", type: "number" },
    { key: "price_sell",        label: "Giá bán dự kiến", type: "number" },
    { key: "evaluation",        label: "Đánh giá chung", type: "textarea" },
  ],
  "Duyệt NC": [
    { key: "approve_verdict",   label: "Kết quả duyệt", type: "verdict" },
    { key: "approve_note",      label: "Nhận xét Leader", type: "textarea" },
  ],
  "Đặt mẫu": [
    { key: "sample_supplier",   label: "NCC đặt mẫu" },
    { key: "sample_contact",    label: "Liên hệ NCC (WeChat, phone...)" },
    { key: "sample_platform",   label: "Nền tảng (1688, Alibaba...)" },
    { key: "sample_qty",        label: "Số lượng mẫu", type: "number" },
    { key: "sample_price_usd",  label: "Giá mẫu (USD)", type: "number" },
    { key: "sample_order_link", label: "Link đơn mẫu", type: "url" },
    { key: "sample_eta",        label: "Dự kiến mẫu về", type: "date" },
  ],
  "Hàng về": [
    { key: "qc_actual",         label: "Thông tin thực tế", type: "textarea" },
    { key: "qc_score",          label: "Điểm QC (/10)" },
    { key: "qc_evaluation",     label: "Đánh giá chung", type: "textarea" },
  ],
  "Duyệt mẫu": [
    { key: "approve_verdict",   label: "Kết quả duyệt mẫu", type: "verdict" },
    { key: "approve_note",      label: "Nhận xét Leader", type: "textarea" },
    { key: "bulk_qty",          label: "SL nhập nếu pass", type: "number" },
    { key: "bulk_price",        label: "Giá nhập (đ)", type: "number" },
  ],
  "Nhập hàng": [
    { key: "bulk_qty",          label: "Số lượng nhập", type: "number" },
    { key: "bulk_price",        label: "Giá nhập (đ)", type: "number" },
    { key: "linked_bulk_po",    label: "Mã PO liên kết" },
    { key: "lesson_note",       label: "Ghi chú", type: "textarea" },
  ],
  // Production
  "Tạo ticket": [
    { key: "base_sku",          label: "SP gốc (SKU)" },
    { key: "base_product",      label: "Tên SP gốc" },
    { key: "improvement_type",  label: "Loại cải tiến" },
  ],
  "Lên ý tưởng": [
    { key: "base_sku",          label: "SP gốc (SKU)" },
    { key: "improvement_type",  label: "Loại cải tiến" },
  ],
  "Duyệt B1": [
    { key: "approve_verdict",   label: "Kết quả duyệt B1", type: "verdict" },
    { key: "approve_note",      label: "Ghi chú", type: "textarea" },
  ],
  "Thiết kế": [
    { key: "design_desc",       label: "Mô tả thiết kế", type: "textarea" },
    { key: "mfg_file_links",    label: "Link file thiết kế", type: "url" },
  ],
  "Thiết kế mẫu": [
    { key: "design_desc",       label: "Mô tả thiết kế", type: "textarea" },
    { key: "mfg_file_links",    label: "Link file thiết kế", type: "url" },
  ],
  "Duyệt 2A": [
    { key: "approve_verdict",   label: "Kết quả duyệt 2A", type: "verdict" },
    { key: "approve_note",      label: "Ghi chú", type: "textarea" },
  ],
  "NCC+Tracking": [
    { key: "mfg_supplier",      label: "NCC gia công" },
    { key: "mfg_contact",       label: "Liên hệ NCC" },
    { key: "mfg_moq",           label: "MOQ", type: "number" },
    { key: "mfg_lead_time",     label: "Lead time (ngày)" },
    { key: "mfg_price_unit",    label: "Giá gia công (đ)", type: "number" },
    { key: "mfg_setup_fee",     label: "Phí khuôn (đ)", type: "number" },
    { key: "mfg_ref_links",     label: "Link NCC / hợp đồng", type: "url" },
  ],
  "Đặt cọc sản xuất": [
    { key: "mfg_supplier",      label: "NCC gia công" },
    { key: "mfg_price_unit",    label: "Giá gia công (đ)", type: "number" },
  ],
  "Chờ mẫu về": [
    { key: "sample_eta",        label: "Dự kiến mẫu về", type: "date" },
  ],
  "QC & Nhận hàng": [
    { key: "check_note",        label: "Ghi chú kiểm tra", type: "textarea" },
  ],
  "Đặt hàng": [
    { key: "bulk_qty",          label: "Số lượng đặt", type: "number" },
    { key: "bulk_price",        label: "Giá (đ)", type: "number" },
    { key: "target_launch_date", label: "Ngày launch dự kiến", type: "date" },
    { key: "linked_bulk_po",    label: "Mã PO" },
  ],
  "Ra mắt": [
    { key: "target_launch_date", label: "Ngày launch", type: "date" },
    { key: "lesson_note",       label: "Ghi chú", type: "textarea" },
  ],
};

/* ─── Verdict color ─────────────────────────────────────── */
function verdictStyle(v: string): { bg: string; color: string } | null {
  const lower = String(v).toLowerCase();
  if (lower.includes("duyệt") && !lower.includes("từ")) return { bg: "#DCFCE7", color: "#15803D" };
  if (lower.includes("từ chối")) return { bg: "#FEE2E2", color: "#B91C1C" };
  if (lower.includes("chỉnh")) return { bg: "#FEF3C7", color: "#92400E" };
  return null;
}

/* ─── Status styles ─────────────────────────────────────── */
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  approved:  { bg: "#DCFCE7", color: "#15803D", label: "Hoàn thành" },
  active:    { bg: "#EFF6FF", color: "#1D4ED8", label: "Đang làm" },
  skipped:   { bg: "#F4F4F5", color: "#71717A", label: "Bỏ qua" },
  locked:    { bg: "#F4F4F5", color: "#A1A1AA", label: "Chưa mở" },
  rejected:  { bg: "#FEE2E2", color: "#B91C1C", label: "Từ chối" },
};

/* ─── Image URL check ───────────────────────────────────── */
function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?|$)/.test(lower)
    || lower.includes("imgur") || lower.includes("ibb.co") || lower.includes("cloudinary");
}

/* ─── Parse deadline ────────────────────────────────────── */
function isOverdue(deadline: string): boolean {
  if (!deadline) return false;
  const m = deadline.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const d = m ? new Date(+m[3], +m[2] - 1, +m[1]) : new Date(deadline);
  if (isNaN(d.getTime())) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d < today;
}
function deadlineToISO(d: string): string {
  if (!d) return "";
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return d;
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function RdDetailModal({
  item, users = [], onClose, onRefresh,
}: {
  item: RdItem; users?: UserRef[]; onClose: () => void; onRefresh: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const steps = getSteps(item);
  const stepsKey = getStepsKey(item);
  const data = (item.data as Record<string, unknown>) || {};

  // Nếu item không có steps JSON → hiện thông báo
  if (steps.length === 0) {
    return (
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 32, maxWidth: 500, textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>{item.name}</div>
          <div className="muted" style={{ marginBottom: 16 }}>
            Sản phẩm này chưa có pipeline workflow. Hãy chỉnh sửa và chọn loại R&D (Nghiên cứu / Sản xuất) để khởi tạo.
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Đóng</button>
        </div>
      </div>
    );
  }

  return <ModalInner item={item} steps={steps} stepsKey={stepsKey} data={data} users={users} onClose={onClose} onRefresh={onRefresh} pending={pending} startTransition={startTransition} />;
}

function ModalInner({
  item, steps: initSteps, stepsKey, data, users, onClose, onRefresh, pending, startTransition,
}: {
  item: RdItem; steps: RdStep[]; stepsKey: string; data: Record<string, unknown>;
  users: UserRef[]; onClose: () => void; onRefresh: () => void;
  pending: boolean; startTransition: (fn: () => Promise<void>) => void;
}) {
  const firstActive = initSteps.findIndex((s) => s.status === "active");
  const [activeIdx, setActiveIdx] = useState(firstActive >= 0 ? firstActive : 0);
  const step = initSteps[activeIdx];

  // Item name (editable)
  const [itemName, setItemName] = useState(item.name || "");
  const [creatingPo, setCreatingPo] = useState(false);

  // Step-level state
  const [assignee, setAssignee] = useState(step.assignee || "");
  const [assigneeName, setAssigneeName] = useState(step.assignee_name || "");
  const [deadline, setDeadline] = useState(step.deadline || "");
  const [checklist, setChecklist] = useState<RdCheckItem[]>(step.checklist || []);
  const [links, setLinks] = useState<RdLink[]>(step.links || []);
  const [photos, setPhotos] = useState<string[]>(step.photos || []);
  const [result, setResult] = useState(step.result || "");
  const [newCheckLabel, setNewCheckLabel] = useState("");
  const [newLink, setNewLink] = useState("");
  const [newPhoto, setNewPhoto] = useState("");

  // Form fields (data.* flat)
  const formFields = STEP_FORM_FIELDS[step.label] || [];
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const f of formFields) d[f.key] = String(data[f.key] ?? "");
    return d;
  });
  const [dirty, setDirty] = useState(false);

  /* ── Switch step ──────────────────────────────────────── */
  function switchStep(idx: number) {
    if (dirty && !confirm("Bạn có thay đổi chưa lưu. Vẫn chuyển bước?")) return;
    const s = initSteps[idx];
    setActiveIdx(idx);
    setAssignee(s.assignee || "");
    setAssigneeName(s.assignee_name || "");
    setDeadline(s.deadline || "");
    setChecklist(s.checklist || []);
    setLinks(s.links || []);
    setPhotos(s.photos || []);
    setResult(s.result || "");
    const fields = STEP_FORM_FIELDS[s.label] || [];
    const d: Record<string, string> = {};
    for (const f of fields) d[f.key] = String(data[f.key] ?? "");
    setFormData(d);
    setDirty(false);
  }

  /* ── Build updated steps for save ────────────────────── */
  function buildUpdatedSteps(statusOverride?: string) {
    return initSteps.map((s, i) => {
      if (i !== activeIdx) return s;
      return {
        ...s,
        assignee,
        assignee_name: assigneeName,
        assigneeName: assigneeName, // keep both formats
        deadline,
        checklist,
        links,
        photos,
        result,
        ...(statusOverride ? { status: statusOverride } : {}),
      };
    });
  }

  function save() {
    startTransition(async () => {
      const newData = { ...data, ...formData, [stepsKey]: JSON.stringify(buildUpdatedSteps()) };
      await saveRdItemAction(item.id, { name: itemName, data: newData });
      setDirty(false);
      onRefresh();
    });
  }

  function markComplete() {
    startTransition(async () => {
      const updated = initSteps.map((s, i) => {
        if (i === activeIdx) return { ...s, status: "approved" as const, assignee, assignee_name: assigneeName, assigneeName, deadline, checklist, links, photos, result };
        if (i === activeIdx + 1 && (s.status === "locked" || s.status === "skipped")) return { ...s, status: "active" as const };
        return s;
      });
      const newData = { ...data, ...formData, [stepsKey]: JSON.stringify(updated) };
      await saveRdItemAction(item.id, { name: itemName, data: newData });
      setDirty(false);
      onRefresh();
      if (activeIdx + 1 < initSteps.length) {
        const next = updated[activeIdx + 1];
        setActiveIdx(activeIdx + 1);
        setAssignee(next.assignee || "");
        setAssigneeName(next.assignee_name || "");
        setDeadline(next.deadline || "");
        setChecklist(next.checklist || []);
        setLinks(next.links || []);
        setPhotos(next.photos || []);
        setResult(next.result || "");
        const fields = STEP_FORM_FIELDS[next.label] || [];
        const d: Record<string, string> = {};
        for (const f of fields) d[f.key] = String(data[f.key] ?? "");
        setFormData(d);
      }
    });
  }

  /* ── Checklist helpers ──────────────────────────────────── */
  function addCheckItem() { if (!newCheckLabel.trim()) return; setChecklist([...checklist, { text: newCheckLabel.trim(), checked: false, verdict: null }]); setNewCheckLabel(""); setDirty(true); }
  function toggleCheck(i: number) { setChecklist(checklist.map((c, idx) => idx === i ? { ...c, checked: !c.checked } : c)); setDirty(true); }
  function setVerdict(i: number, v: "pass" | "fail" | null) { setChecklist(checklist.map((c, idx) => idx === i ? { ...c, verdict: v, checked: v === "pass" } : c)); setDirty(true); }
  function removeCheck(i: number) { setChecklist(checklist.filter((_, idx) => idx !== i)); setDirty(true); }
  function updateCheckNote(i: number, note: string) { setChecklist(checklist.map((c, idx) => idx === i ? { ...c, note } : c)); setDirty(true); }
  const isQcStep = step.label === "Hàng về" || step.label === "Kiểm tra" || step.label === "QC & Nhận hàng";
  const passCount = checklist.filter(c => c.verdict === "pass").length;
  const failCount = checklist.filter(c => c.verdict === "fail").length;

  /* ── Links helpers ──────────────────────────────────────── */
  function addLink() { if (!newLink.trim()) return; setLinks([...links, { tag: "", url: newLink.trim() }]); setNewLink(""); setDirty(true); }
  function removeLink(i: number) { setLinks(links.filter((_, idx) => idx !== i)); setDirty(true); }

  /* ── Photos helpers ─────────────────────────────────────── */
  function addPhoto() { if (!newPhoto.trim()) return; setPhotos([...photos, newPhoto.trim()]); setNewPhoto(""); setDirty(true); }
  function removePhoto(i: number) { setPhotos(photos.filter((_, idx) => idx !== i)); setDirty(true); }

  function setField(key: string, val: string) { setFormData((prev) => ({ ...prev, [key]: val })); setDirty(true); }

  const checkedCount = checklist.filter((c) => c.checked).length;
  const stepStatus = STATUS_STYLE[step.status] || STATUS_STYLE.locked;
  const deadlineOverdue = step.status !== "approved" && isOverdue(deadline);

  /* ── render form field ──────────────────────────────────── */
  function renderField(f: FieldDef) {
    const val = formData[f.key] || "";
    switch (f.type) {
      case "url":
        return (
          <div className="form-group" key={f.key} style={{ gridColumn: "span 2" }}>
            <label>{f.label}</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="text" value={val} onChange={(e) => setField(f.key, e.target.value)} placeholder="https://..." style={{ flex: 1 }} />
              {val && <a href={val} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--blue)", fontWeight: 600, whiteSpace: "nowrap", padding: "4px 8px", border: "1px solid var(--blue)", borderRadius: 4, textDecoration: "none" }}>Mở ↗</a>}
            </div>
          </div>
        );
      case "verdict": {
        const vs = val ? verdictStyle(val) : null;
        return (
          <div className="form-group" key={f.key}>
            <label>{f.label}</label>
            <select value={val} onChange={(e) => setField(f.key, e.target.value)} style={vs ? { background: vs.bg, color: vs.color, fontWeight: 700 } : undefined}>
              <option value="">— Chọn —</option>
              {VERDICT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        );
      }
      case "date": {
        const ov = val && isOverdue(val) && step.status !== "approved";
        return (
          <div className="form-group" key={f.key}>
            <label>{f.label}{ov && <span style={{ color: "var(--red)", fontWeight: 700, marginLeft: 6, fontSize: 10 }}>QUÁ HẠN</span>}</label>
            <input type="date" value={deadlineToISO(val)} onChange={(e) => setField(f.key, e.target.value)} style={ov ? { borderColor: "var(--red)", color: "var(--red)" } : undefined} />
          </div>
        );
      }
      case "textarea":
        return (
          <div className="form-group" key={f.key} style={{ gridColumn: "span 2" }}>
            <label>{f.label}</label>
            <textarea rows={3} value={val} onChange={(e) => setField(f.key, e.target.value)} />
          </div>
        );
      case "number":
        return (
          <div className="form-group" key={f.key}>
            <label>{f.label}</label>
            <input type="text" inputMode="numeric" value={val} onChange={(e) => setField(f.key, e.target.value)} />
          </div>
        );
      default:
        return (
          <div className="form-group" key={f.key}>
            <label>{f.label}</label>
            <input type="text" value={val} onChange={(e) => setField(f.key, e.target.value)} />
          </div>
        );
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "94vw", maxWidth: 1100, maxHeight: "94vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ═══ HEADER ═══ */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "center" }}>
          <span className="chip" style={{ background: step.phaseBg || step.phaseColorBg || "#EDE9FE", color: step.phaseColor || "#6D28D9", fontWeight: 700, fontSize: 10 }}>
            {isProduction(item) ? "Sản xuất / TK" : "Nghiên cứu SP"}
          </span>
          <div style={{ fontWeight: 800, fontSize: 15, flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
            {step.icon || ""} Bước {activeIdx + 1}/{initSteps.length} — {step.label} ·
            <input
              type="text" value={itemName}
              onChange={(e) => { setItemName(e.target.value); setDirty(true); }}
              placeholder="Nhập tên SP..."
              style={{ border: "none", borderBottom: "2px dashed var(--border)", fontWeight: 800, fontSize: 15, color: "var(--text)", outline: "none", padding: "2px 4px", width: 280, background: "transparent" }}
            />
          </div>
          <span className="chip" style={{ background: stepStatus.bg, color: stepStatus.color, fontSize: 10, fontWeight: 700 }}>
            {stepStatus.label}
          </span>
          {deadlineOverdue && <span style={{ background: "#FEE2E2", color: "#B91C1C", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4 }}>QUÁ HẠN</span>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={save} disabled={pending || !dirty}>{pending ? "..." : "Lưu nháp"}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* ═══ STEPPER ═══ */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "#FAFAFA", display: "flex", gap: 4, overflowX: "auto" }}>
          {initSteps.map((s, idx) => {
            const isActive = idx === activeIdx;
            const isDone = s.status === "approved";
            const isSkipped = s.status === "skipped";
            return (
              <button key={idx} type="button" onClick={() => switchStep(idx)} style={{
                flex: "0 0 auto", padding: "6px 10px", borderRadius: 6,
                border: "1px solid " + (isActive ? "var(--blue)" : isDone ? "#86EFAC" : "var(--border)"),
                background: isActive ? "var(--blue)" : isDone ? "#F0FDF4" : "#fff",
                color: isActive ? "#fff" : isDone ? "#15803D" : isSkipped ? "#A1A1AA" : "var(--muted)",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                minWidth: 78, textDecoration: isSkipped ? "line-through" : "none",
                opacity: s.status === "locked" ? 0.5 : 1,
              }}>
                <div style={{ display: "flex", gap: 4 }}>
                  <span>{s.icon || (isDone ? "✓" : isSkipped ? "—" : idx + 1)}</span>
                  <span>{s.label}</span>
                </div>
                {s.assignee_name && <div style={{ fontSize: 9, fontWeight: 400, opacity: 0.8 }}>{s.assignee_name.split("(")[0].trim()}</div>}
              </button>
            );
          })}
        </div>

        {/* ═══ BODY ═══ */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", gap: 16, padding: 16 }}>
          {/* ── LEFT ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Assignee + Deadline */}
            <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
                <label>Người phụ trách</label>
                <select value={assignee} onChange={(e) => {
                  const email = e.target.value;
                  const u = users.find((u) => u.email === email);
                  setAssignee(email);
                  setAssigneeName(u ? (u.name || email) : "");
                  setDirty(true);
                }}>
                  <option value="">— Chọn —</option>
                  {users.map((u) => <option key={u.email} value={u.email}>{u.name || u.email}{u.role ? ` (${u.role})` : ""}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: 160 }}>
                <label>Deadline{deadlineOverdue && <span style={{ color: "var(--red)", fontWeight: 700, marginLeft: 6, fontSize: 10 }}>QUÁ HẠN</span>}</label>
                <input type="date" value={deadlineToISO(deadline)} onChange={(e) => { setDeadline(e.target.value); setDirty(true); }} style={deadlineOverdue ? { borderColor: "var(--red)", color: "var(--red)" } : undefined} />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
                <label>Ghi chú bước</label>
                <input type="text" value={result} onChange={(e) => { setResult(e.target.value); setDirty(true); }} placeholder="Kết quả / ghi chú..." />
              </div>
            </div>

            {/* Form fields */}
            {formFields.length > 0 && (
              <div className="form-grid fg-2" style={{ marginBottom: 14 }}>
                {formFields.map((f) => renderField(f))}
              </div>
            )}

            {/* ── Links ── */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>Links ({links.length})</div>
              {links.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
                  {links.map((link, i) => {
                    const url = getLinkUrl(link);
                    const tag = getLinkTag(link);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        {tag && <span className="chip" style={{ fontSize: 9, padding: "1px 5px" }}>{tag}</span>}
                        <a href={url.startsWith("http") ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: "var(--blue)", wordBreak: "break-all" }}>
                          {url.length > 60 ? url.substring(0, 57) + "..." : url}
                        </a>
                        <button type="button" onClick={() => removeLink(i)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 11, padding: 2 }}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ display: "flex", gap: 4 }}>
                <input value={newLink} onChange={(e) => setNewLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())} placeholder="Dán link..." style={{ flex: 1, fontSize: 12 }} />
                <button type="button" className="btn btn-primary btn-xs" onClick={addLink}>+ Link</button>
              </div>
            </div>

            {/* ── Photos ── */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>Ảnh ({photos.length})</div>
              {photos.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {photos.map((url, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      {isImageUrl(url) ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </a>
                      ) : (
                        <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 72, height: 72, borderRadius: 6, border: "1px solid var(--border)", background: "#F9FAFB", fontSize: 10, color: "var(--blue)", textDecoration: "none", padding: 4, textAlign: "center", wordBreak: "break-all" }}>
                          {url.length > 30 ? url.substring(0, 27) + "..." : url}
                        </a>
                      )}
                      <button type="button" onClick={() => removePhoto(i)} style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "var(--red)", color: "#fff", border: "none", fontSize: 10, cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 4 }}>
                <input value={newPhoto} onChange={(e) => setNewPhoto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPhoto())} placeholder="Dán link ảnh..." style={{ flex: 1, fontSize: 12 }} />
                <button type="button" className="btn btn-primary btn-xs" onClick={addPhoto}>+ Ảnh</button>
              </div>
            </div>

            {/* ── Create PO banner (for Nhập? / Đặt hàng steps) ── */}
            {(step.label === "Nhập hàng" || step.label === "Nhập?" || step.label === "Đặt hàng") && (
              <div style={{ marginTop: 16, padding: "14px 16px", background: "linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 100%)", border: "1px solid #86EFAC", borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6, color: "var(--green)" }}>📦 Tạo đơn nhập hàng</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>
                  Tự động tạo PO trong mục &quot;Tạo/Sửa đơn&quot; với thông tin đã nghiên cứu. Có thể chỉnh sửa sau.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 10 }}><div style={{ color: "var(--muted)" }}>Tên SP</div><div style={{ fontWeight: 700, fontSize: 12 }}>{itemName || "—"}</div></div>
                  <div style={{ fontSize: 10 }}><div style={{ color: "var(--muted)" }}>NCC</div><div style={{ fontWeight: 700, fontSize: 12 }}>{String(formData.sample_supplier || data.sample_supplier || "—")}</div></div>
                  <div style={{ fontSize: 10 }}><div style={{ color: "var(--muted)" }}>SL x Giá</div><div style={{ fontWeight: 700, fontSize: 12 }}>{String(formData.bulk_qty || data.bulk_qty || "—")} x {Number(formData.bulk_price || data.bulk_price || data.price_buy || 0).toLocaleString("vi-VN")}đ</div></div>
                  <div style={{ fontSize: 10 }}><div style={{ color: "var(--muted)" }}>Tổng giá trị</div><div style={{ fontWeight: 700, fontSize: 12, color: "var(--green)" }}>{(Number(formData.bulk_qty || data.bulk_qty || 0) * Number(formData.bulk_price || data.bulk_price || data.price_buy || 0)).toLocaleString("vi-VN")}đ</div></div>
                </div>
                <button type="button" className="btn btn-success" disabled={pending || creatingPo}
                  onClick={() => {
                    setCreatingPo(true);
                    // Save current step data first, then create PO
                    startTransition(async () => {
                      const newData = { ...data, ...formData, [stepsKey]: JSON.stringify(buildUpdatedSteps()) };
                      await saveRdItemAction(item.id, { name: itemName, data: newData });
                      const r = await createPoFromRdAction(item.id);
                      setCreatingPo(false);
                      if (r.ok) {
                        onRefresh();
                        window.location.href = `/create?order_id=${r.orderId}`;
                      } else {
                        alert(r.error || "Lỗi tạo đơn");
                      }
                    });
                  }}
                  style={{ fontSize: 13, padding: "8px 20px" }}
                >
                  {creatingPo ? "Đang tạo..." : "📋 Tạo đơn nhập → Chuyển sang Mua hàng"}
                </button>
              </div>
            )}

            {/* ── Action buttons ── */}
            <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {step.status === "approved" ? <div className="chip chip-green">✓ Hoàn thành</div> : <span />}
              {step.status !== "approved" ? (
                <button type="button" className="btn btn-success btn-sm" onClick={markComplete} disabled={pending}>✓ Hoàn thành bước + Chuyển tiếp</button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={save} disabled={pending || !dirty}>Cập nhật dữ liệu</button>
                  {activeIdx < initSteps.length - 1 && <button type="button" className="btn btn-primary btn-sm" onClick={() => switchStep(activeIdx + 1)} disabled={pending}>Bước tiếp →</button>}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Checklist */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>
                {isQcStep ? `QC Checklist (${passCount}/${checklist.length} Pass${failCount > 0 ? ` · ${failCount} Fail` : ""})` : `Checklist (${checkedCount}/${checklist.length})`}
              </div>
              {checklist.length > 0 && (
                <div style={{ height: 3, borderRadius: 2, background: "#E5E7EB", marginBottom: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 2, width: checklist.length ? `${((isQcStep ? passCount : checkedCount) / checklist.length) * 100}%` : "0%", background: failCount > 0 ? "var(--red)" : (isQcStep ? passCount : checkedCount) === checklist.length ? "var(--green)" : "var(--blue)", transition: "width .2s" }} />
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {checklist.map((c, i) => (
                  <div key={i} style={{ padding: "6px 8px", background: c.verdict === "pass" ? "#F0FDF4" : c.verdict === "fail" ? "#FEF2F2" : c.checked ? "#F0FDF4" : "#FAFAFA", borderRadius: 4, fontSize: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ flex: 1, color: c.verdict === "fail" ? "var(--red)" : c.verdict === "pass" || c.checked ? "var(--muted)" : "var(--text)" }}>{c.text}</span>
                      {isQcStep ? (
                        <div style={{ display: "flex", gap: 3 }}>
                          <button type="button" onClick={() => setVerdict(i, c.verdict === "pass" ? null : "pass")} style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: "pointer",
                            border: `1.5px solid ${c.verdict === "pass" ? "#16A34A" : "#E2E8F0"}`,
                            background: c.verdict === "pass" ? "#F0FDF4" : "#fff",
                            color: c.verdict === "pass" ? "#16A34A" : "#94A3B8",
                          }}>Pass</button>
                          <button type="button" onClick={() => setVerdict(i, c.verdict === "fail" ? null : "fail")} style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: "pointer",
                            border: `1.5px solid ${c.verdict === "fail" ? "#DC2626" : "#E2E8F0"}`,
                            background: c.verdict === "fail" ? "#FEF2F2" : "#fff",
                            color: c.verdict === "fail" ? "#DC2626" : "#94A3B8",
                          }}>Fail</button>
                        </div>
                      ) : (
                        <input type="checkbox" checked={c.checked} onChange={() => toggleCheck(i)} style={{ width: 14, height: 14 }} />
                      )}
                      <button type="button" onClick={() => removeCheck(i)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: 2, fontSize: 11 }}>✕</button>
                    </div>
                    <input type="text" value={c.note || ""} onChange={(e) => updateCheckNote(i, e.target.value)} placeholder="Ghi chú..." style={{ marginTop: 3, fontSize: 11, width: "100%", border: "none", borderBottom: "1px dashed var(--border)", background: "transparent", padding: "2px 0", marginLeft: 4, color: "var(--muted)" }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                <input value={newCheckLabel} onChange={(e) => setNewCheckLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCheckItem())} placeholder="Thêm mục..." style={{ flex: 1, fontSize: 12 }} />
                <button type="button" className="btn btn-primary btn-xs" onClick={addCheckItem}>+</button>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>Timeline</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
                {initSteps.map((s, idx) => {
                  const st = STATUS_STYLE[s.status] || STATUS_STYLE.locked;
                  return (
                    <div key={idx} onClick={() => switchStep(idx)} style={{
                      display: "flex", flexDirection: "column", gap: 1, padding: "4px 6px", borderRadius: 4, cursor: "pointer",
                      background: idx === activeIdx ? "var(--blue-lt)" : "transparent",
                      fontWeight: idx === activeIdx ? 700 : 400, opacity: s.status === "locked" ? 0.5 : 1,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: st.color }}>{s.status === "approved" ? "✓" : s.status === "skipped" ? "—" : "○"} {s.label}</span>
                        <span className="chip" style={{ background: st.bg, color: st.color, fontSize: 9, padding: "1px 5px" }}>{st.label}</span>
                      </div>
                      {(s.assignee_name || s.deadline) && (
                        <div style={{ fontSize: 10, color: "var(--muted)", paddingLeft: 16, display: "flex", gap: 8 }}>
                          {s.assignee_name && <span>→ {s.assignee_name.split("(")[0].trim()}</span>}
                          {s.deadline && <span style={s.status !== "approved" && isOverdue(s.deadline) ? { color: "var(--red)", fontWeight: 700 } : undefined}>{s.deadline}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
