"use client";

import { useState, useTransition } from "react";
import {
  getSteps, getStepsKey, isProduction, getLinkUrl, getLinkTag,
  type RdItem, type RdStep, type RdCheckItem, type RdLink,
} from "@/lib/db/rd-types";
import type { UserRef } from "@/lib/db/users";
import type { SupplierRef } from "@/lib/db/suppliers";
import SupplierPicker from "@/components/SupplierPicker";
import { saveRdItemAction, createPoFromRdAction, createSamplePoAction, deleteSamplePoAction } from "./actions";

/* ─── Field definitions per step label ──────────────────── */
type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "url" | "number" | "date" | "verdict";
  required?: boolean;
};

const VERDICT_OPTIONS = ["Duyệt", "Từ chối", "Cần chỉnh sửa"];

const STEP_FORM_FIELDS: Record<string, FieldDef[]> = {
  "Đề xuất": [
    { key: "description",       label: "Mô tả sản phẩm", type: "textarea", required: true },
    { key: "reason",            label: "Lý do đề xuất", type: "textarea", required: true },
    { key: "ref_links",         label: "Link tham khảo (1688, Shopee...)", type: "url" },
  ],
  "Xác nhận": [
    { key: "confirm_note",      label: "Ghi chú", type: "textarea" },
  ],
  "Nghiên cứu": [
    { key: "usp",               label: "Phân tích USP", type: "textarea", required: true },
    { key: "competitors",       label: "Đối thủ / SP cùng loại", type: "textarea" },
    { key: "market_price",      label: "Giá thị trường" },
    { key: "market_volume",     label: "Volume thị trường" },
    { key: "supplier_name",     label: "NCC dự kiến" },
    { key: "supplier_trust",    label: "Uy tín NCC" },
    { key: "moq",               label: "MOQ" },
    { key: "price_buy",         label: "Giá nhập dự kiến", type: "number", required: true },
    { key: "price_sell",        label: "Giá bán dự kiến", type: "number", required: true },
    { key: "evaluation",        label: "Đánh giá chung", type: "textarea", required: true },
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
    { key: "qc_actual",         label: "Thông tin thực tế", type: "textarea", required: true },
    { key: "qc_score",          label: "Điểm QC (/10)" },
    { key: "qc_evaluation",     label: "Đánh giá chung", type: "textarea", required: true },
  ],
  "Duyệt mẫu": [
    { key: "approve_verdict",   label: "Kết quả duyệt mẫu", type: "verdict" },
    { key: "approve_note",      label: "Nhận xét Leader", type: "textarea" },
    { key: "bulk_qty",          label: "SL nhập nếu pass", type: "number" },
    { key: "bulk_price",        label: "Giá nhập (đ)", type: "number" },
  ],
  "Nhập hàng": [
    { key: "bulk_supplier",     label: "NCC nhập hàng" },
    { key: "bulk_contact",      label: "Liên hệ NCC (WeChat, phone...)" },
    { key: "bulk_platform",     label: "Nền tảng (1688, Alibaba...)" },
    { key: "bulk_qty",          label: "Số lượng nhập", type: "number" },
    { key: "bulk_price",        label: "Giá nhập (đ)", type: "number" },
    { key: "bulk_eta",          label: "Dự kiến hàng về", type: "date" },
    { key: "lesson_note",       label: "Ghi chú", type: "textarea" },
  ],
  // ─── Production pipeline ───
  "Tạo yêu cầu": [
    { key: "description",       label: "Yêu cầu chi tiết", type: "textarea", required: true },
    { key: "ref_links",         label: "Link tham khảo", type: "url" },
  ],
  "Triển khai": [
    { key: "evaluation",        label: "Đánh giá chung", type: "textarea" },
  ],
  // "Đặt mẫu" (production) — chỉ tạo PO, render custom trong modal
  // "Chờ mẫu về" — hiện PO status, render custom trong modal
  "Nhận mẫu & QC": [
    { key: "qc_actual",         label: "Mô tả mẫu thực tế", type: "textarea", required: true },
    { key: "qc_score",          label: "Điểm QC (/10)" },
    { key: "qc_evaluation",     label: "Đánh giá chung", type: "textarea", required: true },
  ],
  // "Duyệt mẫu" — render custom approval UI (giống Duyệt NC)
  // "Đặt hàng" (production) — chỉ tạo PO, render custom trong modal
};

/* ─── Number formatting (1234567 → "1.234.567") ────────── */
function fmtNum(v: string): string {
  const raw = v.replace(/\D/g, "");
  if (!raw) return "";
  return Number(raw).toLocaleString("vi-VN");
}
function rawNum(v: string): string {
  return v.replace(/\D/g, "");
}
/** Smart format: if value is all digits (after removing dots) → format with dots, else leave as-is */
function smartFmt(v: string): string {
  const stripped = v.replace(/\./g, "");
  if (/^\d+$/.test(stripped) && stripped.length > 0) return Number(stripped).toLocaleString("vi-VN");
  return v;
}
function smartRaw(v: string, prev: string): string {
  // If previous was formatted number and user is typing, keep as number
  const stripped = v.replace(/\./g, "");
  const prevStripped = prev.replace(/\./g, "");
  if (/^\d+$/.test(prevStripped) && /^\d*$/.test(stripped)) return stripped;
  return v;
}

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
  item, users = [], suppliers = [], currentUserRole = "VIEWER", currentUserEmail = "", onClose, onRefresh,
}: {
  item: RdItem; users?: UserRef[]; suppliers?: SupplierRef[]; currentUserRole?: string; currentUserEmail?: string; onClose: () => void; onRefresh: () => void;
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

  return <ModalInner item={item} steps={steps} stepsKey={stepsKey} data={data} users={users} suppliers={suppliers} currentUserRole={currentUserRole || "VIEWER"} currentUserEmail={currentUserEmail || ""} onClose={onClose} onRefresh={onRefresh} pending={pending} startTransition={startTransition} />;
}

function ModalInner({
  item, steps: initSteps, stepsKey, data, users, suppliers, currentUserRole, currentUserEmail, onClose, onRefresh, pending, startTransition,
}: {
  item: RdItem; steps: RdStep[]; stepsKey: string; data: Record<string, unknown>;
  users: UserRef[]; suppliers: SupplierRef[]; currentUserRole: string; currentUserEmail: string; onClose: () => void; onRefresh: () => void;
  pending: boolean; startTransition: (fn: () => Promise<void>) => void;
}) {
  const firstActive = initSteps.findIndex((s) => s.status === "active");
  const [activeIdx, setActiveIdx] = useState(firstActive >= 0 ? firstActive : 0);
  const step = initSteps[activeIdx];

  // Production items with old data may have "Nghiên cứu" label → resolve to "Triển khai"
  const isProd = isProduction(item);
  const resolvedLabel = (isProd && step.label === "Nghiên cứu") ? "Triển khai" : step.label;

  // Item name (editable)
  const [itemName, setItemName] = useState(item.name || "");
  const [creatingPo, setCreatingPo] = useState(false);
  const [showPoForm, setShowPoForm] = useState(false);
  const [poMode, setPoMode] = useState<"sample" | "bulk">("sample"); // sample = step 5, bulk = step 8
  // PO form fields
  const [poName, setPoName] = useState(`[Mẫu] ${item.name || "SP mới"}`);
  const [poOwner, setPoOwner] = useState(currentUserEmail);
  const [poPayStatus, setPoPayStatus] = useState("Chưa thanh toán");
  const [poGoodsType, setPoGoodsType] = useState("Hàng mẫu");
  const [poSupplier, setPoSupplier] = useState(String(data.sample_supplier || ""));
  const [poOrderDate, setPoOrderDate] = useState("");
  const [poEta, setPoEta] = useState(String(data.sample_eta || ""));
  const [poArrivalDate, setPoArrivalDate] = useState("");
  const [poDeposit, setPoDeposit] = useState("0");
  const [poNote, setPoNote] = useState(`Đơn mẫu từ R&D: ${item.name || ""}`);
  function openPoForm(mode: "sample" | "bulk") {
    setPoMode(mode);
    if (mode === "bulk") {
      setPoName(item.name || "SP nhập từ R&D");
      setPoGoodsType(String(data.sample_platform || "").includes("1688") ? "Trung Quốc đặt hàng" : "Trung Quốc trữ sẵn");
      setPoSupplier(String(formData.bulk_supplier || data.bulk_supplier || data.sample_supplier || ""));
      setPoEta(String(formData.bulk_eta || data.bulk_eta || ""));
      setPoNote(`Nhập hàng từ R&D: ${item.name || ""}`);
    } else {
      setPoName(`[Mẫu] ${item.name || "SP mới"}`);
      setPoGoodsType("Hàng mẫu");
      setPoSupplier(String(data.sample_supplier || ""));
      setPoEta(String(data.sample_eta || ""));
      setPoNote(`Đơn mẫu từ R&D: ${item.name || ""}`);
    }
    setShowPoForm(true);
  }
  // Auto-detect role: LEADER_* / ADMIN → leader, NV_* → staff
  const isAdmin = currentUserRole === "ADMIN";
  const autoRole = currentUserRole.startsWith("LEADER_") || currentUserRole === "ADMIN" ? "leader" : "staff";
  const [proposerRole, setProposerRole] = useState<"leader" | "staff">(
    data.proposer_role ? String(data.proposer_role) as "leader" | "staff" : autoRole
  );
  const [priority, setPriority] = useState(String(data.priority || "normal"));

  // Step-level state
  const [assignee, setAssignee] = useState(step.assignee || "");
  const [assigneeName, setAssigneeName] = useState(step.assignee_name || "");
  const [deadline, setDeadline] = useState(step.deadline || "");
  const [checklist, setChecklist] = useState<RdCheckItem[]>(() => {
    if (step.checklist && step.checklist.length > 0) return step.checklist;
    // Triển khai: inherit checklist from Tạo yêu cầu step
    if (resolvedLabel === "Triển khai") {
      const step1 = initSteps.find(s => s.label === "Tạo yêu cầu");
      if (step1?.checklist?.length) return step1.checklist.map(c => ({ ...c, checked: false }));
    }
    return [];
  });
  const [links, setLinks] = useState<RdLink[]>(step.links || []);
  const [photos, setPhotos] = useState<string[]>(step.photos || []);
  const [result, setResult] = useState(step.result || "");
  const [newCheckLabel, setNewCheckLabel] = useState("");
  const [newLink, setNewLink] = useState("");
  const [newPhoto, setNewPhoto] = useState("");
  const [previewImg, setPreviewImg] = useState("");

  // Dynamic key-value fields for Nghiên cứu
  type KV = { key: string; value: string };
  const [marketFields, setMarketFields] = useState<KV[]>(() => {
    const saved = data.market_fields as KV[] | undefined;
    return saved?.length ? saved : [{ key: "Đối thủ", value: "" }, { key: "Giá thị trường", value: "" }, { key: "Volume", value: "" }, { key: "Đánh giá KH", value: "" }];
  });
  const [supplyFields, setSupplyFields] = useState<KV[]>(() => {
    const saved = data.supply_fields as KV[] | undefined;
    return saved?.length ? saved : [{ key: "NCC", value: "" }, { key: "Uy tín", value: "" }, { key: "MOQ", value: "" }];
  });

  // Form fields (data.* flat)
  const formFields = STEP_FORM_FIELDS[resolvedLabel] || STEP_FORM_FIELDS[step.label] || [];
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const f of formFields) d[f.key] = String(data[f.key] ?? "");
    return d;
  });
  const [dirty, setDirty] = useState(false);
  const [editingCompleted, setEditingCompleted] = useState(false);
  const isLocked = step.status === "approved" && !editingCompleted;

  /* ── Switch step ──────────────────────────────────────── */
  function switchStep(idx: number) {
    if (dirty && !confirm("Bạn có thay đổi chưa lưu. Vẫn chuyển bước?")) return;
    const s = initSteps[idx];
    setActiveIdx(idx);
    setEditingCompleted(false);
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
    // Reload dynamic fields
    const mf = data.market_fields as KV[] | undefined;
    setMarketFields(mf?.length ? mf : [{ key: "Đối thủ", value: "" }, { key: "Giá thị trường", value: "" }, { key: "Volume", value: "" }, { key: "Đánh giá KH", value: "" }]);
    const sf = data.supply_fields as KV[] | undefined;
    setSupplyFields(sf?.length ? sf : [{ key: "NCC", value: "" }, { key: "Uy tín", value: "" }, { key: "MOQ", value: "" }]);
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

  // Strip revision fields when NV saves/completes
  function clearRevision(d: Record<string, unknown>) {
    const { revision_note: _, revision_by: _b, revision_step: _c, revision_date: _d, ...rest } = d;
    return rest;
  }

  function save() {
    startTransition(async () => {
      const newData = { ...clearRevision(data), ...formData, proposer_role: proposerRole, priority, market_fields: marketFields, supply_fields: supplyFields, [stepsKey]: JSON.stringify(buildUpdatedSteps()) };
      const isNew = item.id === "__NEW__";
      const r = await saveRdItemAction(isNew ? null : item.id, {
        name: itemName,
        stage: item.stage || initSteps[0]?.label || "Đề xuất",
        rd_type: (data.rd_type as string) || null,
        data: newData,
      });
      if (isNew && r.ok) {
        // Update item.id so subsequent saves use the real ID
        (item as Record<string, unknown>).id = r.id;
      }
      setDirty(false);
      onRefresh();
    });
  }

  const isLastStep = activeIdx === initSteps.length - 1;

  function markComplete() {
    // ── Validation trước khi chuyển bước ──
    const missing: string[] = [];
    const sl = resolvedLabel;
    const fd = formData;
    const d = data;

    if (sl === "Đề xuất" || sl === "Tạo yêu cầu") {
      if (!itemName.trim()) missing.push("Tên sản phẩm");
      if (!assignee) missing.push("Giao cho ai");
      if (!deadline) missing.push("Deadline");
      if (!String(fd.description || d.description || "").trim()) missing.push(sl === "Tạo yêu cầu" ? "Yêu cầu chi tiết" : "Mô tả sản phẩm");
      if (sl !== "Tạo yêu cầu" && !String(fd.reason || d.reason || "").trim()) missing.push("Lý do đề xuất");
    } else if (sl === "Triển khai") {
      // Production step 2: checklist + đánh giá chung
      if (!String(fd.evaluation || d.evaluation || "").trim()) missing.push("Đánh giá chung");
    } else if (sl === "Nghiên cứu") {
      if (!String(fd.usp || d.usp || "").trim()) missing.push("Phân tích USP");
      if (!Number(fd.price_buy || d.price_buy || 0)) missing.push("Giá nhập dự kiến");
      if (!Number(fd.price_sell || d.price_sell || 0)) missing.push("Giá bán dự kiến");
      if (!String(fd.evaluation || d.evaluation || "").trim()) missing.push("Đánh giá chung");
    } else if (sl === "Duyệt NC") {
      if (!String(fd.assign_dat_mau || d.assign_dat_mau || "")) missing.push("Giao NV đặt mẫu");
      if (!String(fd.deadline_dat_mau || d.deadline_dat_mau || "")) missing.push("Deadline đặt mẫu");
    } else if (sl === "Đặt mẫu") {
      if (!String(d.linked_sample_po || "")) missing.push("Tạo đơn PO mẫu");
    } else if (sl === "Đặt mẫu" && isProduction(item)) {
      if (!String(d.linked_sample_po || "")) missing.push("Tạo đơn PO mẫu");
    } else if (sl === "Chờ mẫu về") {
      // Bước chờ — không cần validation
    } else if (sl === "Hàng về" || sl === "QC & Nhận hàng" || sl === "Nhận mẫu & QC") {
      // Research: cần mô tả thực tế. Production (Nhận mẫu & QC): bỏ
      if (sl !== "Nhận mẫu & QC" && !String(fd.qc_actual || d.qc_actual || "").trim()) missing.push("Mô tả mẫu thực tế");
      const evaluated = checklist.filter(c => c.verdict === "pass" || c.verdict === "fail");
      if (checklist.length < 3) missing.push("Tối thiểu 3 mục checklist");
      else if (evaluated.length < checklist.length) missing.push("Đánh giá hết checklist (pass/fail)");
      if (!String(fd.qc_evaluation || d.qc_evaluation || "").trim()) missing.push("Đánh giá chung");
    } else if (sl === "Duyệt mẫu") {
      if (!String(fd.assign_nhap_hang || d.assign_nhap_hang || "")) missing.push("Giao NV nhập hàng");
      if (!String(fd.deadline_nhap_hang || d.deadline_nhap_hang || "")) missing.push("Deadline nhập hàng");
    } else if (sl === "Nhập hàng" || sl === "Đặt hàng") {
      if (!String(d.linked_bulk_po || "")) missing.push("Tạo đơn PO nhập hàng");
    }
    // Staff flow: Xác nhận = leader duyệt → cần verdict
    if (sl === "Xác nhận" && proposerRole === "staff") {
      // Leader duyệt đề xuất — không cần validation thêm
    }

    if (missing.length > 0) {
      alert("Chưa đủ thông tin để chuyển bước:\n\n• " + missing.join("\n• "));
      return;
    }

    startTransition(async () => {
      const now = new Date().toISOString();
      const logEntry = { action: "complete", by: currentUserEmail, at: now, step: step.label };
      // Khi Duyệt NC / Duyệt mẫu / Duyệt triển khai → giao NV + deadline cho bước tiếp
      const APPROVAL_STEPS: Record<string, { assignKey: string; dlKey: string }> = {
        "Duyệt NC": { assignKey: "assign_dat_mau", dlKey: "deadline_dat_mau" },
        "Duyệt mẫu": { assignKey: "assign_nhap_hang", dlKey: "deadline_nhap_hang" },
      };
      const approvalCfg = APPROVAL_STEPS[step.label];
      const isApprovalWithAssign = !!approvalCfg;
      const nextAssignKey = approvalCfg?.assignKey || "";
      const nextAssignEmail = isApprovalWithAssign ? String(formData[nextAssignKey] || data[nextAssignKey] || "") : "";
      const nextAssignName = nextAssignEmail ? (users.find((u) => u.email === nextAssignEmail)?.name || nextAssignEmail) : "";
      const nextDlKey = approvalCfg?.dlKey || "";
      const nextDl = isApprovalWithAssign ? String(formData[nextDlKey] || data[nextDlKey] || "") : "";

      const updated = initSteps.map((s, i) => {
        if (i === activeIdx) return { ...s, status: "approved" as const, assignee, assignee_name: assigneeName, assigneeName, deadline, checklist, links, photos, result, logs: [...(s.logs || []), logEntry] };
        if (i === activeIdx + 1 && (s.status === "locked" || s.status === "skipped")) {
          // "Tạo yêu cầu" → "Triển khai": copy checklist (reset checked)
          const inheritChecklist = (step.label === "Tạo yêu cầu" && checklist.length > 0)
            ? checklist.map(c => ({ ...c, checked: false }))
            : undefined;
          // "Chờ mẫu về" → "Nhận mẫu & QC": auto-assign Leader KT + deadline +3 ngày
          const isChoMauVe = step.label === "Chờ mẫu về";
          const leaderKt = isChoMauVe ? users.find(u => u.role === "LEADER_KT") : null;
          const qcDeadline = isChoMauVe ? (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().split("T")[0]; })() : "";
          // Carry assignee from current step if no approval assignment
          const carryAssignee = !nextAssignEmail && !leaderKt && assignee;
          return {
            ...s, status: "active" as const,
            ...(inheritChecklist ? { checklist: inheritChecklist } : {}),
            ...(leaderKt ? { assignee: leaderKt.email, assignee_name: leaderKt.name || leaderKt.email, assigneeName: leaderKt.name || leaderKt.email } : {}),
            ...(nextAssignEmail ? { assignee: nextAssignEmail, assignee_name: nextAssignName, assigneeName: nextAssignName } : {}),
            ...(carryAssignee ? { assignee, assignee_name: assigneeName, assigneeName } : {}),
            ...(qcDeadline ? { deadline: qcDeadline } : {}),
            ...(nextDl ? { deadline: nextDl } : {}),
            logs: [...(s.logs || []), { action: "activate", by: currentUserEmail, at: now, from: step.label, ...(leaderKt ? { assigned_to: leaderKt.name || leaderKt.email } : nextAssignName ? { assigned_to: nextAssignName } : {}) }],
          };
        }
        return s;
      });
      const isFinished = isLastStep;
      const nextStepLabel = isFinished ? "Hoàn thành" : (activeIdx + 1 < updated.length ? updated[activeIdx + 1].label : step.label);
      // Auto-set deadline_qc = sample_eta + 3 ngày khi hoàn thành bước Đặt mẫu
      const autoDeadline: Record<string, string> = {};
      if (step.label === "Đặt mẫu") {
        const eta = String(formData.sample_eta || data.sample_eta || "");
        if (eta) {
          const etaDate = new Date(eta);
          if (!isNaN(etaDate.getTime())) {
            etaDate.setDate(etaDate.getDate() + 3);
            autoDeadline.deadline_qc = etaDate.toISOString().split("T")[0];
            autoDeadline.qc_days = "3";
          }
        }
      }
      const newData = { ...clearRevision(data), ...formData, ...autoDeadline, proposer_role: proposerRole, priority, market_fields: marketFields, supply_fields: supplyFields, [stepsKey]: JSON.stringify(updated) };
      // Mutate local data so next step reads correct values immediately
      if (isApprovalWithAssign) {
        (data as Record<string, unknown>)[nextAssignKey] = nextAssignEmail;
        (data as Record<string, unknown>)[nextDlKey] = nextDl;
      }
      Object.assign(data, autoDeadline, formData);
      const isNew = item.id === "__NEW__";
      const r = await saveRdItemAction(isNew ? null : item.id, {
        name: itemName,
        stage: nextStepLabel,
        rd_type: (data.rd_type as string) || null,
        data: newData,
      });
      if (isNew && r.ok) {
        (item as Record<string, unknown>).id = r.id;
      }
      setDirty(false);
      onRefresh();
      if (isFinished) {
        alert("✓ Ticket hoàn thành! Sản phẩm đã kết thúc quy trình R&D.");
        onClose();
      } else if (isApprovalWithAssign) {
        // Approval steps: alert + close — leader can leave
        const nextName = nextAssignName || "NV";
        alert(`✓ Đã duyệt! Giao ${nextName} thực hiện bước tiếp theo.`);
        onClose();
      } else if (activeIdx + 1 < initSteps.length) {
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
  const isQcStep = step.label === "Hàng về" || step.label === "Kiểm tra" || step.label === "QC & Nhận hàng" || step.label === "Nhận mẫu & QC";
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

  /* ── Mockup-matching styles ───────────────────────────────── */
  const S = {
    section: { marginBottom: 14 } as const,
    label: { fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase" as const, letterSpacing: ".3px", marginBottom: 5 },
    input: { width: "100%", padding: "7px 11px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 12, outline: "none", fontFamily: "inherit" } as React.CSSProperties,
    textarea: { width: "100%", padding: "7px 11px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 12, minHeight: 70, resize: "vertical" as const, outline: "none", fontFamily: "inherit" } as React.CSSProperties,
    select: { width: "100%", padding: "7px 11px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 12, outline: "none", fontFamily: "inherit" } as React.CSSProperties,
  };

  /* ── render form field ──────────────────────────────────── */
  const reqStar = (label: string, required?: boolean) => required ? <>{label}<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span></> : label;

  function renderField(f: FieldDef) {
    const val = formData[f.key] || "";
    switch (f.type) {
      case "url":
        return (
          <div key={f.key} style={{ ...S.section, gridColumn: "span 2" }}>
            <div style={S.label}>{reqStar(f.label, f.required)}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="text" value={val} onChange={(e) => setField(f.key, e.target.value)} placeholder="https://..." style={{ ...S.input, flex: 1 }} />
              {val && <a href={val} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#7C3AED", fontWeight: 600, whiteSpace: "nowrap", padding: "4px 8px", border: "1px solid #7C3AED", borderRadius: 5, textDecoration: "none" }}>Mở ↗</a>}
            </div>
          </div>
        );
      case "verdict": {
        const vs = val ? verdictStyle(val) : null;
        return (
          <div key={f.key} style={S.section}>
            <div style={S.label}>{reqStar(f.label, f.required)}</div>
            <select value={val} onChange={(e) => setField(f.key, e.target.value)} style={{ ...S.select, ...(vs ? { background: vs.bg, color: vs.color, fontWeight: 700 } : {}) }}>
              <option value="">— Chọn —</option>
              {VERDICT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        );
      }
      case "date": {
        const ov = val && isOverdue(val) && step.status !== "approved";
        return (
          <div key={f.key} style={S.section}>
            <div style={S.label}>{reqStar(f.label, f.required)}{ov && <span style={{ color: "#DC2626", fontWeight: 700, marginLeft: 6, fontSize: 10 }}>QUÁ HẠN</span>}</div>
            <input type="date" value={deadlineToISO(val)} onChange={(e) => setField(f.key, e.target.value)} style={{ ...S.input, ...(ov ? { borderColor: "#DC2626", color: "#DC2626" } : {}) }} />
          </div>
        );
      }
      case "textarea":
        return (
          <div key={f.key} style={{ ...S.section, gridColumn: "span 2" }}>
            <div style={S.label}>{reqStar(f.label, f.required)}</div>
            <textarea value={val} onChange={(e) => setField(f.key, e.target.value)} style={S.textarea} />
          </div>
        );
      case "number":
        return (
          <div key={f.key} style={S.section}>
            <div style={S.label}>{reqStar(f.label, f.required)}</div>
            <input type="text" inputMode="numeric" value={fmtNum(val)} onChange={(e) => setField(f.key, rawNum(e.target.value))} style={S.input} />
          </div>
        );
      default:
        return (
          <div key={f.key} style={S.section}>
            <div style={S.label}>{reqStar(f.label, f.required)}</div>
            <input type="text" value={val} onChange={(e) => setField(f.key, e.target.value)} style={S.input} />
          </div>
        );
    }
  }

  const isApprovalStep = step.label === "Xác nhận" || step.label === "Duyệt NC" || step.label === "Duyệt mẫu"
    || step.label === "Duyệt B1" || step.label === "Duyệt 2A";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: 920, maxWidth: "96vw", height: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.2)", overflow: "hidden" }}>

        {/* ═══ HEADER ═══ */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="text" value={itemName} onChange={(e) => { setItemName(e.target.value); setDirty(true); }} placeholder="Tên sản phẩm..."
                style={{ border: "none", borderBottom: "2px dashed #E2E8F0", fontWeight: 800, fontSize: 15, outline: "none", padding: "2px 4px", width: 320, background: "transparent" }} />
            </div>
            <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>
              {item.created_by || ""} · {item.created_at ? String(item.created_at).substring(0, 10) : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600,
              background: isApprovalStep ? "#FFF7ED" : "#EFF6FF",
              color: isApprovalStep ? "#D97706" : "#3B82F6",
            }}>
              Bước {activeIdx + 1}: {resolvedLabel}
            </span>
            <button type="button" onClick={save} disabled={pending || !dirty} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, border: "1px solid #E2E8F0", background: dirty ? "#7C3AED" : "#F1F5F9", color: dirty ? "#fff" : "#94A3B8", cursor: "pointer" }}>
              {pending ? "..." : "Lưu"}
            </button>
            <button type="button" onClick={onClose} style={{ padding: "4px 8px", borderRadius: 6, fontSize: 12, border: "1px solid #E2E8F0", background: "#F1F5F9", color: "#64748B", cursor: "pointer" }}>✕</button>
          </div>
        </div>

        {/* ═══ BODY: Stepper left + Form right ═══ */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* ── LEFT STEPPER ── */}
          <div style={{ width: 190, background: "#F8FAFC", borderRight: "1px solid #E2E8F0", padding: "14px 10px", overflowY: "auto", flexShrink: 0 }}>
            {initSteps.map((s, idx) => {
              const isActive = idx === activeIdx;
              const isDone = s.status === "approved";
              const isLocked = s.status === "locked";
              const dotClass = isDone ? { bg: "#22C55E", color: "#fff" }
                : isActive ? (isApprovalStep ? { bg: "#FEF3C7", color: "#D97706" } : { bg: "#3B82F6", color: "#fff" })
                : { bg: "#E2E8F0", color: "#94A3B8" };
              const statusText = isActive
                ? (isApprovalStep ? "Chờ duyệt" : "Đang làm")
                : isDone ? "✓ Xong" : "—";
              return (
                <div key={idx}>
                  <div onClick={() => switchStep(idx)} style={{
                    display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 6px", borderRadius: 6, cursor: "pointer",
                    background: isActive ? "#EFF6FF" : "transparent", opacity: isLocked ? 0.5 : 1,
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 800, flexShrink: 0, background: dotClass.bg, color: dotClass.color,
                    }}>
                      {isDone ? "✓" : idx + 1}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600 }}>{s.label === "Xác nhận" ? (proposerRole === "leader" ? "NV nhận việc" : "Duyệt ĐX") : (isProd && s.label === "Nghiên cứu") ? "Triển khai" : s.label}</div>
                      <div style={{ fontSize: 9, color: "#94A3B8" }}>{statusText}</div>
                      {s.assignee_name && <div style={{ fontSize: 9, color: "#94A3B8" }}>→ {s.assignee_name.split("(")[0].trim()}</div>}
                    </div>
                  </div>
                  {idx < initSteps.length - 1 && <div style={{ width: 1, height: 8, background: "#D1D5DB", marginLeft: 20 }} />}
                </div>
              );
            })}
          </div>

          {/* ── RIGHT FORM AREA ── */}
          <div style={{ flex: 1, padding: 18, overflowY: "auto" }}>

            {/* ── Revision banner — hiện khi leader yêu cầu chỉnh sửa ── */}
            {!!data.revision_note && (
              <div style={{ padding: "8px 12px", background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 8, marginBottom: 14, fontSize: 11 }}>
                <div style={{ fontWeight: 700, color: "#92400E", marginBottom: 3 }}>
                  ↺ Yêu cầu chỉnh sửa — Bước: {String(data.revision_step || "")}
                </div>
                <div style={{ color: "#78350F", whiteSpace: "pre-line" }}>{String(data.revision_note || "")}</div>
                <div style={{ fontSize: 9, color: "#A16207", marginTop: 4 }}>
                  Từ: {String(data.revision_by || "")} · {String(data.revision_date || "")}
                </div>
              </div>
            )}

            {/* ── Production: Tạo yêu cầu — custom form ── */}
            {step.label === "Tạo yêu cầu" && (
              <>
                {/* Tên SP */}
                <div style={S.section}>
                  <div style={S.label}>{reqStar("Tên sản phẩm", true)}</div>
                  <input type="text" value={itemName} onChange={(e) => { setItemName(e.target.value); setDirty(true); }} placeholder="Nhập tên SP mới" style={S.input} />
                </div>

                {/* Giao NV + Deadline + Ưu tiên */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div>
                    <div style={S.label}>{reqStar("Giao cho", true)}</div>
                    <select value={assignee} onChange={(e) => {
                      const email = e.target.value;
                      const u = users.find((uu) => uu.email === email);
                      setAssignee(email); setAssigneeName(u ? (u.name || email) : ""); setDirty(true);
                    }} style={S.select}>
                      <option value="">— Chọn —</option>
                      {users.map((u) => <option key={u.email} value={u.email}>{u.name || u.email}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={S.label}>{reqStar("Deadline", true)}</div>
                    <input type="date" value={deadlineToISO(deadline)} onChange={(e) => { setDeadline(e.target.value); setDirty(true); }} style={S.input} />
                  </div>
                  <div>
                    <div style={S.label}>Ưu tiên</div>
                    <select value={priority} onChange={(e) => { setPriority(e.target.value); setDirty(true); }} style={S.select}>
                      <option value="normal">Bình thường</option>
                      <option value="high">Cao</option>
                      <option value="low">Thấp</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Role selector — only at Đề xuất step */}
            {step.label === "Đề xuất" && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <div style={S.label}>Bạn đang ở vị trí nào?</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {([
                      { key: "leader" as const, icon: "👔", name: "Leader", desc: "Giao nhân viên làm" },
                      { key: "staff" as const, icon: "💡", name: "Nhân viên", desc: "Gửi sếp duyệt" },
                    ]).map((r) => (
                      <div key={r.key} onClick={() => { if (isAdmin) { setProposerRole(r.key); setDirty(true); } }}
                        style={{
                          flex: 1, padding: 10, border: `2px solid ${proposerRole === r.key ? "#7C3AED" : "#E2E8F0"}`,
                          borderRadius: 10, cursor: isAdmin ? "pointer" : "default", textAlign: "center",
                          background: proposerRole === r.key ? "#F5F3FF" : "#fff",
                          opacity: !isAdmin && proposerRole !== r.key ? 0.4 : 1,
                        }}>
                        <div style={{ fontSize: 22 }}>{r.icon}</div>
                        <div style={{ fontSize: 11, fontWeight: 700 }}>{r.name}</div>
                        <div style={{ fontSize: 9, color: "#94A3B8" }}>{r.desc}</div>
                      </div>
                    ))}
                  </div>
                  {!isAdmin && <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 4 }}>Tự động theo vị trí của bạn</div>}
                </div>

                {/* Tên SP inline */}
                <div style={S.section}>
                  <div style={S.label}>Tên sản phẩm<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span></div>
                  <input type="text" value={itemName} onChange={(e) => { setItemName(e.target.value); setDirty(true); }} placeholder="VD: Quạt phun sương mini USB" style={S.input} />
                </div>
              </>
            )}

            {/* ── Deadline banner for ALL steps (except Đề xuất which has its own) ── */}
            {step.label !== "Đề xuất" && step.label !== "Tạo yêu cầu" && (() => {
              const dxStep = initSteps.find((s) => s.label === "Đề xuất" || s.label === "Tạo yêu cầu");
              const dxDeadline = dxStep?.deadline || "";
              const stepLabel = resolvedLabel;
              let dlLabel = ""; let dlValue = "";

              if (["Xác nhận", "NV nhận việc", "Nghiên cứu", "Triển khai", "Duyệt ĐX"].includes(stepLabel)) {
                dlLabel = "Deadline NC (từ Đề xuất)"; dlValue = dxDeadline;
              } else if (stepLabel === "Duyệt NC") {
                dlLabel = "Deadline NC (từ Đề xuất)"; dlValue = dxDeadline;
              } else if (stepLabel === "Đặt mẫu") {
                // Ưu tiên: ETA từ PO mẫu > deadline từ Duyệt NC
                const poEtaVal = String(data.sample_eta || "");
                const dlFromStep4 = String(data.deadline_dat_mau || "");
                dlValue = poEtaVal || dlFromStep4;
                dlLabel = poEtaVal ? "ETA mẫu về (từ PO)" : "Deadline đặt mẫu (từ Duyệt NC)";
              } else if (stepLabel === "Hàng về" || stepLabel === "QC & Nhận hàng") {
                // Step 6: 2 banners — ETA dự kiến + deadline QC thực tế
                const etaVal = String(data.sample_eta || "");
                const arrivalVal = String(data.arrival_date || "");
                const baseDate = arrivalVal || etaVal;
                if (baseDate) {
                  const bd = new Date(baseDate);
                  if (!isNaN(bd.getTime())) { bd.setDate(bd.getDate() + 3); dlValue = bd.toISOString().split("T")[0]; }
                }
                dlLabel = arrivalVal
                  ? `Deadline QC (về ${arrivalVal} + 3 ngày)`
                  : etaVal ? `Deadline QC dự kiến (ETA ${etaVal} + 3 ngày)` : "Deadline QC";
              } else if (stepLabel === "Duyệt mẫu") {
                // Step 7: không cần deadline — chỉ thông báo
                dlLabel = ""; dlValue = "";
              } else if (stepLabel === "Nhập hàng" || stepLabel === "Đặt hàng") {
                const bulkEta = String(data.bulk_eta || "");
                const dlFromApproval = String(data.deadline_nhap_hang || "");
                dlValue = bulkEta || dlFromApproval;
                dlLabel = bulkEta ? "ETA hàng nhập về (từ PO)" : dlFromApproval ? "Deadline nhập hàng (từ Duyệt mẫu)" : "Deadline nhập hàng";
              }
              const dlOverdue = dlValue && step.status !== "approved" ? isOverdue(dlValue) : false;

              if (stepLabel === "Hàng về" || stepLabel === "QC & Nhận hàng") {
                const etaVal = String(data.sample_eta || "");
                const arrivalVal = String(data.arrival_date || "");
                return (
                  <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                    {/* Banner 1: ETA dự kiến */}
                    <div style={{ padding: "6px 10px", background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 7, fontSize: 11 }}>
                      <span style={{ color: "#0369A1", fontWeight: 600 }}>
                        📦 ETA mẫu về: {etaVal || "chưa có — cần nhập ở bước Đặt mẫu"}
                      </span>
                    </div>
                    {/* Banner 2: Deadline QC thực tế */}
                    <div style={{ padding: "6px 10px", background: dlOverdue ? "#FEF2F2" : dlValue ? "#F0FDF4" : "#FFF7ED", border: `1px solid ${dlOverdue ? "#FECACA" : dlValue ? "#BBF7D0" : "#FED7AA"}`, borderRadius: 7, fontSize: 11 }}>
                      <span style={{ color: dlOverdue ? "#DC2626" : dlValue ? "#15803D" : "#D97706", fontWeight: 600 }}>
                        {dlOverdue ? "⚠ QUÁ HẠN" : dlValue ? "⏰" : "⚠"} {arrivalVal ? `Deadline QC (về thực tế ${arrivalVal} + 3 ngày): ${dlValue}` : dlValue ? `Deadline QC dự kiến: ${dlValue}` : "Chờ hàng về để tính deadline QC"}
                      </span>
                    </div>
                  </div>
                );
              }

              return dlLabel ? (
                <div style={{ padding: "6px 10px", background: dlOverdue ? "#FEF2F2" : dlValue ? "#F0F9FF" : "#FFF7ED", border: `1px solid ${dlOverdue ? "#FECACA" : dlValue ? "#BAE6FD" : "#FED7AA"}`, borderRadius: 7, marginBottom: 12, fontSize: 11, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: dlOverdue ? "#DC2626" : dlValue ? "#0369A1" : "#D97706", fontWeight: 600 }}>
                    {dlOverdue ? "⚠ QUÁ HẠN" : dlValue ? "⏰" : "⚠"} {dlLabel}: {dlValue || "Chưa đặt — vui lòng set deadline ở bước trước"}
                  </span>
                </div>
              ) : null;
            })()}

            {/* ══ APPROVAL / CONFIRMATION STEPS — dedicated UI ══ */}
            {isApprovalStep && (() => {
              // Completed approval → show summary + edit button (unless editing)
              if (step.status === "approved" && !editingCompleted) {
                const isDuyetNC2 = step.label === "Duyệt NC";
                const isDuyetMau2 = step.label === "Duyệt mẫu";
                const assignedTo = isDuyetNC2 ? String(data.assign_dat_mau || "") : isDuyetMau2 ? String(data.assign_nhap_hang || "") : "";
                const assignedName = assignedTo ? (users.find((u) => u.email === assignedTo)?.name || assignedTo) : "";
                const dlSet = isDuyetNC2 ? String(data.deadline_dat_mau || "") : isDuyetMau2 ? String(data.deadline_nhap_hang || "") : "";
                return (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ padding: 14, background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, marginBottom: 8 }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, marginBottom: 8, background: "#DCFCE7", color: "#15803D" }}>
                        ✓ {step.label} — Đã duyệt
                      </div>
                      {step.result && <div style={{ fontSize: 11, color: "#374151", marginBottom: 4 }}>Nhận xét: {step.result}</div>}
                      {step.assignee_name && <div style={{ fontSize: 10, color: "#64748B", marginBottom: 2 }}>Duyệt bởi: {step.assignee_name}</div>}
                      {assignedName && <div style={{ fontSize: 10, color: "#64748B", marginBottom: 2 }}>Giao cho: {assignedName}</div>}
                      {dlSet && <div style={{ fontSize: 10, color: "#64748B", marginBottom: 2 }}>Deadline: {dlSet}</div>}
                      {/* Log entries */}
                      {step.logs && step.logs.length > 0 && step.logs.map((log, li) => {
                        const at = String(log.at || "");
                        const by = String(log.by || "");
                        const byName = users.find((u) => u.email === by)?.name || by;
                        const timeStr = at ? new Date(at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
                        return (
                          <div key={li} style={{ fontSize: 9, color: "#94A3B8", marginTop: 2 }}>
                            {timeStr} — {byName}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button type="button" onClick={() => setEditingCompleted(true)} style={{ padding: "5px 12px", borderRadius: 7, fontSize: 10, fontWeight: 600, border: "1px solid #D97706", background: "#fff", color: "#D97706", cursor: "pointer" }}>✏️ Sửa</button>
                    </div>
                  </div>
                );
              }
              const isXacNhan = step.label === "Xác nhận";
              const isDuyetNC = step.label === "Duyệt NC";
              const isDuyetMau = step.label === "Duyệt mẫu";
              const leaderFlow = proposerRole === "leader";
              // Title
              const title = isXacNhan
                ? (leaderFlow ? "NV xác nhận nhận việc" : "Leader duyệt đề xuất")
                : isDuyetNC ? (isProd ? "Leader duyệt triển khai" : "Leader duyệt nghiên cứu")
                : isDuyetMau ? "Leader duyệt mẫu" : step.label;
              // Avatar
              const avatarBg = (isXacNhan && leaderFlow) ? "#DBEAFE" : "#F3E8FF";
              const avatarColor = (isXacNhan && leaderFlow) ? "#2563EB" : "#7C3AED";
              const avatarText = (isXacNhan && leaderFlow) ? "NV" : "LĐ";
              const personName = (isXacNhan && leaderFlow) ? (assigneeName || "Nhân viên được giao") : "Leader";
              const personTag = (isXacNhan && leaderFlow) ? "Nhân viên" : "Leader";
              const personTagBg = (isXacNhan && leaderFlow) ? "#EFF6FF" : "#F5F3FF";
              const personTagColor = (isXacNhan && leaderFlow) ? "#3B82F6" : "#7C3AED";
              // Summary
              // Build summary from previous step data
              const prevStep = activeIdx > 0 ? initSteps[activeIdx - 1] : null;
              const prevChecklist = prevStep?.checklist || [];
              const prevChecked = prevChecklist.filter(c => c.checked).length;
              const summary = isXacNhan
                ? `${leaderFlow ? "Leader" : "NV"} đề xuất:\n${itemName || "SP mới"}\n${String(data.description || data.reason || "")}`
                : isDuyetNC && isProd
                ? `Checklist: ${prevChecked}/${prevChecklist.length} hoàn thành\n${prevChecklist.map(c => `${c.checked ? "✓" : "○"} ${c.text}${c.note ? ` — ${c.note}` : ""}`).join("\n")}\nĐánh giá: ${String(data.evaluation || "—")}`
                : isDuyetNC
                ? `USP: ${String(data.usp || "—")}\nNCC: ${String(data.supplier_name || "—")}, Giá: ${String(data.price_buy || "—")} → ${String(data.price_sell || "—")}\nĐánh giá: ${String(data.evaluation || "—")}`
                : isDuyetMau
                ? `QC: ${prevChecklist.filter(c => c.verdict === "pass").length}/${prevChecklist.length} Pass${prevChecklist.filter(c => c.verdict === "fail").length > 0 ? ` · ${prevChecklist.filter(c => c.verdict === "fail").length} Fail` : ""}\n${prevChecklist.map(c => `${c.verdict === "pass" ? "✓" : c.verdict === "fail" ? "✗" : "○"} ${c.text}`).join("\n")}\nĐánh giá: ${String(data.qc_evaluation || "Chưa có")}`
                : "";
              // Action buttons
              const greenLabel = isXacNhan && leaderFlow ? "✓ Nhận việc — Bắt đầu NC"
                : isXacNhan ? "✓ Duyệt — Cho nghiên cứu"
                : isDuyetNC ? "✓ Duyệt — Cho đặt mẫu"
                : isDuyetMau ? "✓ PASS — Cho nhập hàng"
                : "✓ Duyệt";
              const amberLabel = isXacNhan && leaderFlow ? "↺ Hỏi lại Leader"
                : isXacNhan ? "↺ Yêu cầu sửa ĐX"
                : isDuyetNC ? "↺ Yêu cầu NC lại"
                : isDuyetMau ? "↺ Yêu cầu QC lại"
                : "↺ Yêu cầu sửa";

              return (
                <div style={{ padding: 14, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10 }}>
                  {/* Badge */}
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, marginBottom: 10, background: "#FFF7ED", color: "#D97706" }}>
                    {title}
                  </div>
                  {/* Avatar + Person */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: avatarBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: avatarColor }}>
                      {avatarText}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>
                        {personName}
                        <span style={{ fontSize: 9, marginLeft: 4, padding: "1px 5px", borderRadius: 4, background: personTagBg, color: personTagColor }}>{personTag}</span>
                      </div>
                      <div style={{ fontSize: 9, color: "#94A3B8" }}>
                        {isXacNhan && leaderFlow ? `Được giao bởi Leader · Deadline ${deadline || "—"}` : isXacNhan ? "Duyệt đề xuất từ nhân viên" : isDuyetNC ? (isProd ? "Duyệt triển khai từ NV" : "Duyệt nghiên cứu từ NV") : "Duyệt mẫu từ NV"}
                      </div>
                    </div>
                  </div>
                  {/* Summary */}
                  <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 7, padding: 8, marginBottom: 10, fontSize: 11, color: "#64748B", whiteSpace: "pre-line" }}>
                    {summary}
                  </div>
                  {/* Note */}
                  <div style={S.section}>
                    <div style={S.label}>{isDuyetNC || isDuyetMau ? "Nhận xét Leader" : "Ghi chú"}</div>
                    <textarea value={result} onChange={(e) => { setResult(e.target.value); setDirty(true); }} placeholder={isXacNhan && leaderFlow ? "Ghi chú khi nhận việc hoặc lý do từ chối..." : "Nhận xét, góp ý..."} style={S.textarea} />
                  </div>
                  {/* Giao việc + Deadline cho bước tiếp theo */}
                  {(isDuyetNC || isDuyetMau) && (() => {
                    const dlKey = isDuyetNC ? "deadline_dat_mau" : "deadline_nhap_hang";
                    const dlVal = formData[dlKey] || String(data[dlKey] || "");
                    const assignNextKey = isDuyetNC ? "assign_dat_mau" : "assign_nhap_hang";
                    const assignNextVal = formData[assignNextKey] || String(data[assignNextKey] || "");
                    return (
                    <>
                    <div style={S.section}>
                      <div style={S.label}>Giao NV {isDuyetNC ? "đặt mẫu" : "nhập hàng"}<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span></div>
                      <select value={assignNextVal} onChange={(e) => setField(assignNextKey, e.target.value)} style={S.select}>
                        <option value="">— Chọn nhân viên —</option>
                        {users.map((u) => <option key={u.email} value={u.email}>{u.name || u.email}</option>)}
                      </select>
                    </div>
                    <div style={S.section}>
                      <div style={S.label}>Deadline {isDuyetNC ? "Đặt mẫu" : "Nhập hàng"}<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span></div>
                      <input type="date" value={deadlineToISO(dlVal)}
                        onChange={(e) => { setField(dlKey, e.target.value); }}
                        style={S.input} />
                    </div>
                    </>
                    );
                  })()}
                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: 6 }}>
                    {step.status === "approved" && editingCompleted && (
                      <button type="button" onClick={() => setEditingCompleted(false)} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#F1F5F9", color: "#64748B", cursor: "pointer" }}>Huỷ sửa</button>
                    )}
                    <button type="button" disabled={pending} onClick={() => {
                      markComplete();
                    }} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#16A34A", color: "#fff", cursor: "pointer" }}>
                      {greenLabel}
                    </button>
                    <button type="button" disabled={pending} onClick={() => {
                      if (!result.trim()) { alert("Vui lòng nhập nhận xét / lý do yêu cầu sửa."); return; }
                      startTransition(async () => {
                        const now = new Date().toLocaleDateString("vi-VN");
                        const byName = users.find((u) => u.email === currentUserEmail)?.name || currentUserEmail;
                        // Reopen previous work step, lock this + intermediate approval steps
                        // "Nhận mẫu & QC" not pass → quay về "Triển khai SP" (skip "Duyệt triển khai")
                        const revLog = { action: "revision", by: currentUserEmail, at: now, step: step.label, note: result };
                        const reopenIdx = (step.label === "Nhận mẫu & QC")
                          ? initSteps.findIndex(s => s.label === "Triển khai SP")
                          : activeIdx - 1;
                        const targetIdx = reopenIdx >= 0 ? reopenIdx : activeIdx - 1;
                        const updatedSteps = initSteps.map((s, i) => {
                          if (i === activeIdx) return { ...s, status: "locked" as const, logs: [...(s.logs || []), revLog] };
                          // Lock intermediate steps between target and current
                          if (i > targetIdx && i < activeIdx) return { ...s, status: "locked" as const, logs: [...(s.logs || []), { action: "revision_reset", by: currentUserEmail, at: now, from: step.label }] };
                          if (i === targetIdx) return { ...s, status: "active" as const, logs: [...(s.logs || []), { action: "reopened", by: currentUserEmail, at: now, from: step.label }] };
                          return s;
                        });
                        const newData = {
                          ...data, ...formData, proposer_role: proposerRole, priority,
                          revision_note: result, revision_by: byName, revision_step: step.label, revision_date: now,
                          [stepsKey]: JSON.stringify(updatedSteps),
                        };
                        await saveRdItemAction(item.id, { name: itemName, data: newData });
                        onRefresh();
                        alert("↺ Đã gửi yêu cầu chỉnh sửa. NV sẽ thấy thông báo trên ticket.");
                        onClose();
                      });
                    }} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#D97706", color: "#fff", cursor: "pointer" }}>
                      {amberLabel}
                    </button>
                    <button type="button" disabled={pending} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#DC2626", color: "#fff", cursor: "pointer" }}
                      onClick={() => {
                        if (!confirm("Từ chối ticket này? Sẽ chuyển sang trạng thái Loại bỏ.")) return;
                        startTransition(async () => {
                          const rejectLog = { action: "reject", by: currentUserEmail, at: new Date().toISOString(), step: step.label, note: result };
                          const updated = initSteps.map((s, i) => i === activeIdx ? { ...s, status: "rejected" as const, result, logs: [...(s.logs || []), rejectLog] } : s);
                          const newData = { ...data, proposer_role: proposerRole, priority, [stepsKey]: JSON.stringify(updated) };
                          await saveRdItemAction(item.id, { name: itemName, stage: "Loại bỏ", data: newData });
                          onRefresh();
                          alert("✕ Đã từ chối ticket.");
                          onClose();
                        });
                      }}>
                      ✕ Từ chối
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* ══ NORMAL WORK STEPS ══ */}
            {!isApprovalStep && (<>

            {/* ── Locked summary view for completed steps ── */}
            {isLocked ? (() => {
              // Collect all non-empty field values for this step
              const fields = STEP_FORM_FIELDS[step.label] || [];
              const filledFields = fields.filter((f) => {
                const v = String(data[f.key] || "").trim();
                return v && v !== "0";
              });
              return (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ padding: 12, background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, marginBottom: 10 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, marginBottom: 8, background: "#DCFCE7", color: "#15803D" }}>
                      ✓ {step.label} — Hoàn thành
                    </div>
                    {filledFields.length > 0 ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: 11 }}>
                        {filledFields.map((f) => {
                          const val = String(data[f.key] || "");
                          const display = f.type === "number" ? Number(val).toLocaleString("vi-VN") : val.length > 80 ? val.substring(0, 77) + "..." : val;
                          return (
                            <div key={f.key} style={{ padding: "3px 0", borderBottom: "1px solid #F1F5F9" }}>
                              <span style={{ color: "#94A3B8", fontSize: 10 }}>{f.label}: </span>
                              <span style={{ color: "#374151", fontWeight: 500 }}>{display}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>Không có dữ liệu nhập</div>
                    )}
                    {step.assignee_name && <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 6 }}>Người thực hiện: {step.assignee_name}</div>}
                    {step.result && <div style={{ fontSize: 10, color: "#64748B", marginTop: 4 }}>Ghi chú: {step.result}</div>}
                  </div>
                  {/* Checklist summary */}
                  {checklist.length > 0 && (
                    <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>
                      Checklist: {checklist.filter((c) => c.checked || c.verdict === "pass").length}/{checklist.length} pass
                    </div>
                  )}
                  {/* Links/photos count */}
                  {(links.length > 0 || photos.length > 0) && (
                    <div style={{ fontSize: 10, color: "#94A3B8" }}>
                      {links.length > 0 && `${links.length} tài liệu`}{links.length > 0 && photos.length > 0 && " · "}{photos.length > 0 && `${photos.length} hình ảnh`}
                    </div>
                  )}
                  {/* Linked PO for Đặt mẫu */}
                  {step.label === "Đặt mẫu" && !!data.linked_sample_po && (
                    <div style={{ marginTop: 8, padding: "6px 10px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 7, fontSize: 11 }}>
                      <span style={{ color: "#15803D", fontWeight: 600 }}>📦 PO mẫu: </span>
                      <a href={`/list?q=${String(data.linked_sample_po)}`} style={{ color: "#2563EB", fontWeight: 700, textDecoration: "none" }}>{String(data.linked_sample_po)}</a>
                      {!!data.sample_eta && <span style={{ color: "#64748B", marginLeft: 8 }}>· ETA: {String(data.sample_eta)}</span>}
                    </div>
                  )}
                  {/* Lịch sử bước — chi tiết */}
                  {(() => {
                    const hasLogs = step.logs && step.logs.length > 0;
                    // Build rich summary from step data
                    const summaryLines: Array<{ label: string; value: string; color?: string }> = [];
                    if (step.label === "Đặt mẫu") {
                      if (data.sample_supplier) summaryLines.push({ label: "NCC", value: `${String(data.sample_supplier)}${data.sample_platform ? ` (${String(data.sample_platform)})` : ""}` });
                      if (data.sample_contact) summaryLines.push({ label: "Liên hệ", value: String(data.sample_contact) });
                      if (data.sample_qty) summaryLines.push({ label: "SL mẫu", value: `${Number(data.sample_qty).toLocaleString("vi-VN")} cái` });
                      if (data.sample_price_usd) summaryLines.push({ label: "Giá mẫu", value: `$${Number(data.sample_price_usd).toLocaleString("vi-VN")}` });
                      if (data.linked_sample_po) summaryLines.push({ label: "Đơn PO", value: String(data.linked_sample_po), color: "#2563EB" });
                      if (data.sample_eta) summaryLines.push({ label: "ETA hàng về", value: String(data.sample_eta) });
                    } else if (step.label === "Triển khai" || step.label === "Nghiên cứu") {
                      if (data.supplier_name) summaryLines.push({ label: "NCC", value: String(data.supplier_name) });
                      if (data.price_buy) summaryLines.push({ label: "Giá nhập", value: `${Number(data.price_buy).toLocaleString("vi-VN")}đ` });
                      if (data.price_sell) summaryLines.push({ label: "Giá bán", value: `${Number(data.price_sell).toLocaleString("vi-VN")}đ` });
                      if (data.evaluation) summaryLines.push({ label: "Đánh giá", value: String(data.evaluation).substring(0, 60) });
                    } else if (step.label === "Duyệt NC" || step.label === "Duyệt mẫu" || step.label === "Duyệt B1" || step.label === "Duyệt 2A") {
                      if (data.approve_verdict) summaryLines.push({ label: "Kết quả", value: String(data.approve_verdict), color: String(data.approve_verdict).includes("Duyệt") ? "#15803D" : "#B91C1C" });
                      if (data.approve_note) summaryLines.push({ label: "Nhận xét", value: String(data.approve_note).substring(0, 60) });
                    } else if (step.label === "Nhập hàng" || step.label === "Đặt hàng") {
                      if (data.bulk_supplier) summaryLines.push({ label: "NCC", value: `${String(data.bulk_supplier)}${data.bulk_platform ? ` (${String(data.bulk_platform)})` : ""}` });
                      if (data.bulk_contact) summaryLines.push({ label: "Liên hệ", value: String(data.bulk_contact) });
                      if (data.bulk_qty) summaryLines.push({ label: "SL nhập", value: `${Number(data.bulk_qty).toLocaleString("vi-VN")} cái` });
                      if (data.bulk_price) summaryLines.push({ label: "Giá nhập", value: `${Number(data.bulk_price).toLocaleString("vi-VN")}đ` });
                      if (data.linked_bulk_po) summaryLines.push({ label: "Đơn PO", value: String(data.linked_bulk_po), color: "#2563EB" });
                      if (data.bulk_eta) summaryLines.push({ label: "ETA hàng về", value: String(data.bulk_eta) });
                    }
                    return (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", marginBottom: 4 }}>Lịch sử</div>
                      {/* Rich summary */}
                      {summaryLines.length > 0 && (
                        <div style={{ padding: "6px 10px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 7, marginBottom: 6, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px", fontSize: 10 }}>
                          {summaryLines.map((s, si) => (
                            <div key={si} style={{ display: "contents" }}>
                              <span style={{ color: "#94A3B8", fontWeight: 600 }}>{s.label}:</span>
                              <span style={{ color: s.color || "#374151", fontWeight: s.color ? 700 : 500 }}>{s.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Activity log entries */}
                      {hasLogs ? step.logs.map((log, li) => {
                        const at = String(log.at || "");
                        const by = String(log.by || "");
                        const byName = users.find((u) => u.email === by)?.name || by;
                        const timeStr = at ? new Date(at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
                        const actionLabel = log.action === "complete" ? "✓ Hoàn thành"
                          : log.action === "activate" ? "▸ Bắt đầu"
                          : log.action === "revision" ? "↺ Yêu cầu chỉnh sửa"
                          : log.action === "reopened" ? "↺ Mở lại"
                          : log.action === "reject" ? "✕ Từ chối"
                          : String(log.action || "");
                        return (
                          <div key={li} style={{ fontSize: 10, color: "#64748B", padding: "2px 0", display: "flex", gap: 6, alignItems: "baseline" }}>
                            <span style={{ color: "#94A3B8", minWidth: 75, flexShrink: 0 }}>{timeStr}</span>
                            <span style={{ fontWeight: 600 }}>{actionLabel}</span>
                            <span>— {byName}</span>
                            {!!log.note && <span style={{ color: "#94A3B8", fontStyle: "italic" }}>&quot;{String(log.note).substring(0, 50)}&quot;</span>}
                          </div>
                        );
                      }) : (
                        <div style={{ fontSize: 10, color: "#64748B", padding: "2px 0" }}>
                          ✓ Hoàn thành{step.assignee_name ? ` — ${step.assignee_name}` : ""}
                        </div>
                      )}
                    </div>
                    );
                  })()}
                </div>
              );
            })() : (
            <div>

            {/* deadline banner moved above approval/normal split */}

            {/* Assignee + Deadline — only at Đề xuất step */}
            {step.label === "Đề xuất" && (
              <div style={S.section}>
                <div style={S.label}>{proposerRole === "leader" ? "Giao cho nhân viên" : "Gửi Leader duyệt"}<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span></div>
                <select value={assignee} onChange={(e) => {
                  const email = e.target.value;
                  const u = users.find((u) => u.email === email);
                  setAssignee(email); setAssigneeName(u ? (u.name || email) : ""); setDirty(true);
                }} style={S.select}>
                  <option value="">— Chọn —</option>
                  {users.map((u) => <option key={u.email} value={u.email}>{u.name || u.email}</option>)}
                </select>
              </div>
            )}
            {step.label === "Đề xuất" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div style={S.section}>
                <div style={S.label}>
                  Deadline<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span>{deadlineOverdue && <span style={{ color: "#DC2626", fontWeight: 700, marginLeft: 4, fontSize: 10 }}>QUÁ HẠN</span>}
                </div>
                <input type="date" value={deadlineToISO(deadline)} onChange={(e) => { setDeadline(e.target.value); setDirty(true); }}
                  style={{ ...S.input, ...(deadlineOverdue ? { borderColor: "#DC2626", color: "#DC2626" } : {}) }} />
              </div>
              <div style={S.section}>
                <div style={S.label}>Ưu tiên</div>
                <select value={priority} onChange={(e) => { setPriority(e.target.value); setDirty(true); }} style={S.select}>
                  <option value="normal">Bình thường</option>
                  <option value="urgent">Gấp</option>
                  <option value="low">Thấp</option>
                </select>
                </div>
            </div>
            )}

            {/* ── Production: Đặt mẫu — chỉ nút PO ── */}
            {step.label === "Đặt mẫu" && isProduction(item) ? (() => {
              const linkedPo = String(data.linked_sample_po || "");
              return (
                <div style={{ marginBottom: 14 }}>
                  {!linkedPo ? (
                    <div style={{ padding: 20, border: "2px dashed #C4B5FD", borderRadius: 10, textAlign: "center", cursor: "pointer" }}
                      onClick={() => openPoForm("sample")}>
                      <div style={{ fontSize: 28, marginBottom: 6 }}>📦</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#7C3AED" }}>Tạo đơn PO đặt mẫu</div>
                      <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>Đơn PO sẽ tạo bên mục Đơn hàng</div>
                    </div>
                  ) : (
                    <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 20 }}>✅</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#15803D" }}>{linkedPo}</div>
                          <div style={{ fontSize: 10, color: "#475569" }}>{item.name}</div>
                        </div>
                        <a href={`/list?q=${linkedPo}`} style={{ fontSize: 10, color: "#7C3AED", fontWeight: 600, textDecoration: "none", padding: "4px 8px", background: "#F5F3FF", borderRadius: 5 }}>Xem đơn ↗</a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()

            /* ── Production: Chờ mẫu về — hiện PO status + check ETA ── */
            : step.label === "Chờ mẫu về" ? (() => {
              const linkedPo = String(data.linked_sample_po || "");
              const eta = String(data.sample_eta || "");
              const today = new Date().toISOString().substring(0, 10);
              const arrived = eta && eta <= today;
              return (
                <div style={{ marginBottom: 14 }}>
                  {linkedPo && (
                    <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 20 }}>📦</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#1D4ED8" }}>{linkedPo}</div>
                          <div style={{ fontSize: 10, color: "#475569" }}>{item.name}{eta ? ` · ETA: ${eta}` : ""}</div>
                        </div>
                        <a href={`/list?q=${linkedPo}`} style={{ fontSize: 10, color: "#7C3AED", fontWeight: 600, textDecoration: "none", padding: "4px 8px", background: "#F5F3FF", borderRadius: 5 }}>Xem đơn ↗</a>
                      </div>
                    </div>
                  )}
                  <div style={{
                    background: arrived ? "#F0FDF4" : "#EFF6FF",
                    border: `1px solid ${arrived ? "#BBF7D0" : "#BFDBFE"}`,
                    borderRadius: 12, padding: "32px 20px", textAlign: "center", flex: 1,
                  }}>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>{arrived ? "📦" : "⏳"}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: arrived ? "#15803D" : "#1D4ED8", marginBottom: 6 }}>
                      {arrived ? "Hàng mẫu đã về!" : "Đang chờ hàng mẫu về"}
                    </div>
                    {eta && (
                      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>
                        ETA: {eta} {arrived ? "— Đã đến hạn" : `— Còn ${Math.max(0, Math.ceil((new Date(eta).getTime() - Date.now()) / 86400000))} ngày`}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: arrived ? "#16A34A" : "#94A3B8", fontWeight: arrived ? 600 : 400, marginTop: 4 }}>
                      {arrived ? "Bấm \"Đã về — Chuyển QC\" bên dưới" : "Nút chuyển bước sẽ sáng khi đến ngày ETA"}
                    </div>
                  </div>
                </div>
              );
            })()

            /* ── Production: Đặt hàng — chỉ nút PO ── */
            : (step.label === "Đặt hàng" && isProduction(item)) ? (() => {
              const linkedPo = String(data.linked_bulk_po || "");
              return (
                <div style={{ marginBottom: 14 }}>
                  {!linkedPo ? (
                    <div style={{ padding: 20, border: "2px dashed #C4B5FD", borderRadius: 10, textAlign: "center", cursor: "pointer" }}
                      onClick={() => openPoForm("bulk")}>
                      <div style={{ fontSize: 28, marginBottom: 6 }}>📦</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#7C3AED" }}>Tạo đơn PO nhập hàng</div>
                      <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>Đơn PO sẽ tạo bên mục Đơn hàng</div>
                    </div>
                  ) : (
                    <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 20 }}>✅</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#15803D" }}>{linkedPo}</div>
                          <div style={{ fontSize: 10, color: "#475569" }}>{item.name}</div>
                        </div>
                        <a href={`/list?q=${linkedPo}`} style={{ fontSize: 10, color: "#7C3AED", fontWeight: 600, textDecoration: "none", padding: "4px 8px", background: "#F5F3FF", borderRadius: 5 }}>Xem đơn ↗</a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()

            /* ── Research: Đặt mẫu (existing) ── */
            : step.label === "Đặt mẫu" ? (() => {
              const linkedSamplePo = String(data.linked_sample_po || "");
              return (
              <>
                {/* Chọn người đặt mẫu */}
                <div style={S.section}>
                  <div style={S.label}>Người đặt mẫu</div>
                  <select value={assignee} onChange={(e) => {
                    const email = e.target.value;
                    const u = users.find((u) => u.email === email);
                    setAssignee(email); setAssigneeName(u ? (u.name || email) : ""); setDirty(true);
                  }} style={S.select}>
                    <option value="">— Tự đặt —</option>
                    {users.map((u) => <option key={u.email} value={u.email}>{u.name || u.email}</option>)}
                  </select>
                  {assigneeName && <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 3 }}>Giao cho: {assigneeName}</div>}
                </div>

                {/* Thông tin NCC */}
                <div style={S.section}>
                  <div style={S.label}>Thông tin nhà cung cấp</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 }}>
                    <input type="text" value={formData.sample_supplier || ""} onChange={(e) => setField("sample_supplier", e.target.value)} placeholder="Tên NCC" style={S.input} />
                    <input type="text" value={formData.sample_platform || ""} onChange={(e) => setField("sample_platform", e.target.value)} placeholder="Nền tảng (1688, Alibaba...)" style={S.input} />
                  </div>
                  <input type="text" value={formData.sample_contact || ""} onChange={(e) => setField("sample_contact", e.target.value)} placeholder="Liên hệ (WeChat, phone...)" style={S.input} />
                </div>

                {/* Tạo đơn PO mua mẫu */}
                <div style={S.section}>
                  <div style={S.label}>Tạo đơn PO mua mẫu</div>
                  {!linkedSamplePo ? (
                    <div style={{ padding: 12, border: "2px dashed #C4B5FD", borderRadius: 10, textAlign: "center", cursor: "pointer" }}
                      onClick={() => openPoForm("sample")}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>📦</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#7C3AED" }}>Tạo đơn PO mua mẫu</div>
                      <div style={{ fontSize: 9, color: "#94A3B8" }}>Điền thông tin đơn hàng mẫu</div>
                    </div>
                  ) : (
                    <div style={{ background: "#F0FDF4", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#16A34A" }}>Đơn PO đã tạo</div>
                        <button type="button" onClick={() => {
                          if (!confirm(`Xoá đơn nháp ${linkedSamplePo}?`)) return;
                          startTransition(async () => {
                            await deleteSamplePoAction(item.id);
                            onRefresh();
                          });
                        }} style={{ fontSize: 9, color: "#DC2626", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                          Xoá đơn nháp
                        </button>
                      </div>
                      <div style={{ fontSize: 11, marginBottom: 2 }}>{linkedSamplePo} — {item.name || "SP mẫu"}</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 9, color: "#94A3B8" }}>Theo dõi bên Danh sách đơn</span>
                        <a href={`/create?order_id=${linkedSamplePo}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: "#7C3AED", fontWeight: 600, textDecoration: "none" }}>Xem đơn ↗</a>
                      </div>
                    </div>
                  )}
                </div>
              </>
              );
            })() : step.label === "Nhận mẫu & QC" ? (() => {
              /* ── Production: Nhận mẫu & QC — 2 giai đoạn ── */
              if (isLocked) {
                // Step đã hoàn thành — hiện summary
                return (
                  <div style={{ padding: "12px 14px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: "#15803D", marginBottom: 6 }}>QC hoàn thành</div>
                    <div style={{ color: "#64748B", marginBottom: 4 }}>
                      {passCount}/{checklist.length} Pass{failCount > 0 ? ` · ${failCount} Fail` : ""}
                    </div>
                    {checklist.map((c, i) => (
                      <div key={i} style={{ fontSize: 10, color: c.verdict === "fail" ? "#DC2626" : "#16A34A", marginBottom: 1 }}>
                        {c.verdict === "pass" ? "✓" : c.verdict === "fail" ? "✗" : "○"} {c.text}
                      </div>
                    ))}
                    {String(data.qc_evaluation || "") && (
                      <div style={{ marginTop: 6, color: "#475569" }}>Đánh giá: {String(data.qc_evaluation)}</div>
                    )}
                  </div>
                );
              }
              const qcConfirmed = !!data.qc_confirmed;
              const eta = String(data.sample_eta || "");
              const linkedPo = String(data.linked_sample_po || "");
              const qcDeadlineVal = String(data.qc_deadline || deadline || "");
              return (
              <>
                {!qcConfirmed ? (
                  <>
                    {/* ═══ GIAI ĐOẠN 1: Xác nhận tiếp nhận ═══ */}
                    <div style={{ padding: "12px 14px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 14, fontSize: 11 }}>
                      <div style={{ fontWeight: 700, color: "#475569", marginBottom: 8 }}>Tiếp nhận mẫu</div>
                      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", alignItems: "center" }}>
                        <span style={{ color: "#94A3B8" }}>Người tiếp nhận:</span>
                        <select value={assignee} onChange={(e) => {
                          const email = e.target.value;
                          const u = users.find(uu => uu.email === email);
                          setAssignee(email); setAssigneeName(u ? (u.name || email) : ""); setDirty(true);
                        }} style={{ fontSize: 11, padding: "2px 6px", border: "1px solid #E2E8F0", borderRadius: 4 }}>
                          <option value="">— Chọn —</option>
                          {users.map(u => <option key={u.email} value={u.email}>{u.name || u.email}</option>)}
                        </select>
                        <span style={{ color: "#94A3B8" }}>Sản phẩm:</span>
                        <span style={{ fontWeight: 600 }}>{itemName}</span>
                        <span style={{ color: "#94A3B8" }}>Ngày về (ETA):</span>
                        <span>{eta || "—"}</span>
                        {linkedPo && <><span style={{ color: "#94A3B8" }}>Đơn PO:</span><span style={{ color: "#2563EB", fontWeight: 600 }}>{linkedPo}</span></>}
                      </div>
                    </div>
                    <div style={S.section}>
                      <div style={S.label}>Tình trạng nhận hàng</div>
                      <textarea value={formData.qc_receive_note || ""} onChange={(e) => setField("qc_receive_note", e.target.value)} placeholder="Mô tả nhanh tình trạng đóng gói, ngoại quan khi nhận..." style={{ ...S.textarea, minHeight: 40 }} />
                    </div>
                    <div style={S.section}>
                      <div style={S.label}>Deadline hoàn thành QC<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span> <span style={{ color: "#94A3B8", fontWeight: 400 }}>(tối đa 7 ngày)</span></div>
                      <input type="date" value={formData.qc_deadline || qcDeadlineVal} onChange={(e) => {
                        const picked = e.target.value;
                        const max = new Date(); max.setDate(max.getDate() + 7);
                        if (picked > max.toISOString().split("T")[0]) { alert("Tối đa 7 ngày!"); return; }
                        setField("qc_deadline", picked); setDeadline(picked); setDirty(true);
                      }} max={(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })()} style={S.input} />
                    </div>
                    <button type="button" disabled={pending || !(formData.qc_deadline || qcDeadlineVal)} onClick={() => {
                      startTransition(async () => {
                        const dl = formData.qc_deadline || qcDeadlineVal || "";
                        if (!dl) { alert("Chọn deadline QC trước"); return; }
                        const logEntry = { action: "qc_confirmed", by: currentUserEmail, at: new Date().toISOString(), deadline: dl, note: formData.qc_receive_note || "" };
                        const updSteps = buildUpdatedSteps().map((s, i) => i === activeIdx ? { ...s, deadline: dl, logs: [...(s.logs || []), logEntry] } : s);
                        const newData = { ...data, ...formData, qc_confirmed: true, qc_deadline: dl, [stepsKey]: JSON.stringify(updSteps) };
                        const isNew = item.id === "__NEW__";
                        await saveRdItemAction(isNew ? null : item.id, { name: itemName, data: newData });
                        (data as Record<string, unknown>).qc_confirmed = true;
                        (data as Record<string, unknown>).qc_deadline = dl;
                        setDeadline(dl);
                        setDirty(false);
                        onRefresh();
                      });
                    }} style={{ padding: "8px 16px", borderRadius: 7, fontSize: 12, fontWeight: 700, border: "none", background: (formData.qc_deadline || qcDeadlineVal) ? "#7C3AED" : "#E2E8F0", color: (formData.qc_deadline || qcDeadlineVal) ? "#fff" : "#94A3B8", cursor: (formData.qc_deadline || qcDeadlineVal) ? "pointer" : "not-allowed", marginBottom: 14, width: "100%" }}>
                      Xác nhận tiếp nhận — Bắt đầu QC
                    </button>
                  </>
                ) : (
                  <>
                    {/* ═══ GIAI ĐOẠN 2: QC (đã xác nhận tiếp nhận) ═══ */}
                    {/* Summary tiếp nhận — compact + nút sửa */}
                    <div style={{ padding: "8px 12px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, marginBottom: 14, fontSize: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ color: "#15803D", fontWeight: 600 }}>Đã tiếp nhận</span>
                        <span style={{ color: "#64748B", marginLeft: 8 }}>{assigneeName || "Leader KT"} · {itemName} · DL: {qcDeadlineVal}</span>
                        {String(data.qc_receive_note || "") && <span style={{ color: "#94A3B8", marginLeft: 6 }}>· {String(data.qc_receive_note).substring(0, 40)}</span>}
                      </div>
                      <button type="button" onClick={() => {
                        startTransition(async () => {
                          const logEntry = { action: "qc_reopen", by: currentUserEmail, at: new Date().toISOString() };
                          const updSteps = buildUpdatedSteps().map((s, i) => i === activeIdx ? { ...s, logs: [...(s.logs || []), logEntry] } : s);
                          const newData = { ...data, ...formData, qc_confirmed: false, [stepsKey]: JSON.stringify(updSteps) };
                          await saveRdItemAction(item.id, { name: itemName, data: newData });
                          (data as Record<string, unknown>).qc_confirmed = false;
                          setDirty(false);
                          onRefresh();
                        });
                      }} style={{ fontSize: 9, color: "#7C3AED", fontWeight: 600, background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>Sửa</button>
                    </div>

                    {/* QC Checklist */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 5 }}>
                        QC Checklist ({passCount}/{checklist.length} Pass{failCount > 0 ? ` · ${failCount} Fail` : ""})<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span>
                      </div>
                      {checklist.length > 0 && (
                        <div style={{ height: 3, borderRadius: 2, background: "#E5E7EB", marginBottom: 8, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 2, width: `${(passCount / checklist.length) * 100}%`, background: failCount > 0 ? "#DC2626" : passCount === checklist.length ? "#16A34A" : "#3B82F6", transition: "width .2s" }} />
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {checklist.map((c, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 0", borderBottom: "1px solid #F1F5F9" }}>
                            <span style={{ flex: 1, fontSize: 11, color: c.verdict === "fail" ? "#DC2626" : c.verdict === "pass" ? "#94A3B8" : "#18181B" }}>{c.text}</span>
                            <div style={{ display: "flex", gap: 3 }}>
                              <button type="button" onClick={() => setVerdict(i, c.verdict === "pass" ? null : "pass")} style={{
                                padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: "pointer",
                                border: `1.5px solid ${c.verdict === "pass" ? "#16A34A" : "#E2E8F0"}`,
                                background: c.verdict === "pass" ? "#F0FDF4" : "#fff", color: c.verdict === "pass" ? "#16A34A" : "#94A3B8",
                              }}>Pass</button>
                              <button type="button" onClick={() => setVerdict(i, c.verdict === "fail" ? null : "fail")} style={{
                                padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: "pointer",
                                border: `1.5px solid ${c.verdict === "fail" ? "#DC2626" : "#E2E8F0"}`,
                                background: c.verdict === "fail" ? "#FEF2F2" : "#fff", color: c.verdict === "fail" ? "#DC2626" : "#94A3B8",
                              }}>Fail</button>
                            </div>
                            <button type="button" onClick={() => removeCheck(i)} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 12, padding: "0 2px" }}>✕</button>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                        <input value={newCheckLabel} onChange={(e) => setNewCheckLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCheckItem())} placeholder="Thêm mục kiểm tra..."
                          style={{ flex: 1, padding: "5px 11px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 12, outline: "none" }} />
                        <button type="button" onClick={addCheckItem} style={{ padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#7C3AED", color: "#fff", cursor: "pointer" }}>+</button>
                      </div>
                    </div>

                    {/* Đánh giá chung */}
                    <div style={S.section}>
                      <div style={S.label}>Đánh giá chung<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span></div>
                      <textarea value={formData.qc_evaluation || ""} onChange={(e) => setField("qc_evaluation", e.target.value)} placeholder="Kết luận QC: PASS/FAIL, ghi chú..." style={{ ...S.textarea, minHeight: 50 }} />
                    </div>
                  </>
                )}
              </>
              );
            })() : step.label === "Hàng về" || step.label === "QC & Nhận hàng" ? (() => {
              /* ── Research: Hàng về — full QC form ── */
              const samplePo = String(data.linked_sample_po || "");
              const dxStep = initSteps.find((s) => s.label === "Đề xuất");
              const originalAssignee = dxStep?.assignee_name || dxStep?.assignee || "";
              const leaderKt = users.find((u) => u.role === "LEADER_KT");
              return (
              <>
                <div style={{ padding: "8px 10px", background: "#EFF6FF", borderRadius: 8, marginBottom: 12, fontSize: 11, color: "#1E40AF" }}>
                  📦 {samplePo ? `Mẫu đã về — ${samplePo}. ` : "Hàng về — "}Thông báo đã gửi cho NV + Leader KT.
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1, padding: "8px 10px", background: "#F8FAFC", borderRadius: 8, border: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: 9, color: "#94A3B8", marginBottom: 3 }}>NV tiếp nhận</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#2563EB" }}>NV</div>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{originalAssignee || "Chưa giao"}</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, padding: "8px 10px", background: "#F8FAFC", borderRadius: 8, border: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: 9, color: "#94A3B8", marginBottom: 3 }}>Leader Kỹ thuật</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#F3E8FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#7C3AED" }}>KT</div>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{leaderKt?.name || "Chưa có"}</span>
                    </div>
                  </div>
                </div>
                <div style={S.section}>
                  <div style={S.label}>Thông tin thực tế<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span></div>
                  <textarea value={formData.qc_actual || ""} onChange={(e) => setField("qc_actual", e.target.value)} placeholder="Mô tả thực tế: kích thước, trọng lượng, đóng gói..." style={S.textarea} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 5 }}>
                    Checklist đánh giá ({passCount}/{checklist.length} Pass{failCount > 0 ? ` · ${failCount} Fail` : ""})<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span>
                  </div>
                  {checklist.length > 0 && (
                    <div style={{ height: 3, borderRadius: 2, background: "#E5E7EB", marginBottom: 8, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, width: `${(passCount / checklist.length) * 100}%`, background: failCount > 0 ? "#DC2626" : passCount === checklist.length ? "#16A34A" : "#3B82F6", transition: "width .2s" }} />
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {checklist.map((c, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 0", borderBottom: "1px solid #F1F5F9" }}>
                        <span style={{ flex: 1, fontSize: 11, color: c.verdict === "fail" ? "#DC2626" : c.verdict === "pass" ? "#94A3B8" : "#18181B" }}>{c.text}</span>
                        <div style={{ display: "flex", gap: 3 }}>
                          <button type="button" onClick={() => setVerdict(i, c.verdict === "pass" ? null : "pass")} style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: "pointer",
                            border: `1.5px solid ${c.verdict === "pass" ? "#16A34A" : "#E2E8F0"}`,
                            background: c.verdict === "pass" ? "#F0FDF4" : "#fff", color: c.verdict === "pass" ? "#16A34A" : "#94A3B8",
                          }}>Pass</button>
                          <button type="button" onClick={() => setVerdict(i, c.verdict === "fail" ? null : "fail")} style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: "pointer",
                            border: `1.5px solid ${c.verdict === "fail" ? "#DC2626" : "#E2E8F0"}`,
                            background: c.verdict === "fail" ? "#FEF2F2" : "#fff", color: c.verdict === "fail" ? "#DC2626" : "#94A3B8",
                          }}>Fail</button>
                        </div>
                        <button type="button" onClick={() => removeCheck(i)} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 14, padding: 2 }}>✕</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                    <input value={newCheckLabel} onChange={(e) => setNewCheckLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCheckItem())} placeholder="Thêm mục kiểm tra..."
                      style={{ flex: 1, padding: "5px 11px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 12, outline: "none" }} />
                    <button type="button" onClick={addCheckItem} style={{ padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#7C3AED", color: "#fff", cursor: "pointer" }}>+</button>
                  </div>
                </div>
                <div style={S.section}>
                  <div style={S.label}>Đánh giá chung<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span></div>
                  <textarea value={formData.qc_evaluation || ""} onChange={(e) => setField("qc_evaluation", e.target.value)} placeholder="VD: 8/10. Pin tốt, phun sương OK 2/3 chế độ. Đề xuất: PASS — nhập 200 cái test." style={{ ...S.textarea, minHeight: 60 }} />
                </div>
              </>
              );
            })() : resolvedLabel === "Triển khai" ? (
              <>
                {/* Tóm tắt yêu cầu từ Tạo yêu cầu */}
                {(data.description || data.ref_links) && (
                  <div style={{ padding: "8px 12px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 14, fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: "#475569", marginBottom: 4 }}>Yêu cầu từ bước 1</div>
                    <div style={{ fontWeight: 600, color: "#18181B", marginBottom: 2 }}>{itemName}</div>
                    {!!data.description && <div style={{ color: "#64748B", marginBottom: 2 }}>{String(data.description)}</div>}
                    {!!data.ref_links && (
                      <a href={String(data.ref_links)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#7C3AED", textDecoration: "none" }}>
                        Link tham khảo
                      </a>
                    )}
                  </div>
                )}

                {/* Checklist từ bước 1 */}
                <div style={{ marginBottom: 14 }}>
                  <div style={S.label}>Checklist ({checklist.filter(c => c.checked).length}/{checklist.length})</div>
                  {checklist.map((c, i) => (
                    <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid #F1F5F9" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input type="checkbox" checked={c.checked} onChange={() => {
                          const n = [...checklist]; n[i] = { ...n[i], checked: !n[i].checked }; setChecklist(n); setDirty(true);
                        }} style={{ accentColor: "#7C3AED", width: 16, height: 16, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: c.checked ? "#16A34A" : "#18181B", fontWeight: c.checked ? 600 : 400 }}>{c.text}</span>
                      </label>
                      {c.checked && (
                        <input value={c.note || ""} onChange={(e) => {
                          const n = [...checklist]; n[i] = { ...n[i], note: e.target.value }; setChecklist(n); setDirty(true);
                        }} placeholder="Ghi chú kết quả..." style={{ width: "100%", fontSize: 11, padding: "5px 8px", border: "1px solid #E2E8F0", borderRadius: 4, color: "#475569", marginTop: 4, marginLeft: 24 }} />
                      )}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                    <input value={newCheckLabel} onChange={(e) => setNewCheckLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && newCheckLabel.trim()) { e.preventDefault(); addCheckItem(); } }}
                      placeholder="+ Thêm mục..." style={{ ...S.input, flex: 1, fontSize: 11 }} />
                  </div>
                </div>

                {/* Đánh giá chung */}
                <div style={S.section}>
                  <div style={S.label}>Đánh giá chung</div>
                  <textarea value={formData.evaluation || ""} onChange={(e) => setField("evaluation", e.target.value)} placeholder="Nhận xét, kết luận sau triển khai..." style={{ ...S.textarea, minHeight: 50 }} />
                </div>
              </>
            ) : resolvedLabel === "Nghiên cứu" ? (
              <>
                {/* Tóm tắt yêu cầu từ Đề xuất */}
                {(data.description || data.reason || data.ref_links) && (
                  <div style={{ padding: "8px 12px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, marginBottom: 14, fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: "#475569", marginBottom: 4 }}>Yêu cầu nghiên cứu</div>
                    <div style={{ fontWeight: 600, color: "#18181B", marginBottom: 2 }}>{itemName}</div>
                    {!!data.description && <div style={{ color: "#64748B", marginBottom: 2 }}>{String(data.description)}</div>}
                    {!!data.reason && <div style={{ color: "#64748B", marginBottom: 2 }}>Lý do: {String(data.reason)}</div>}
                    {!!data.ref_links && (
                      <a href={String(data.ref_links)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#7C3AED", textDecoration: "none" }}>
                        Link tham khảo
                      </a>
                    )}
                  </div>
                )}

                {/* USP */}
                <div style={S.section}>
                  <div style={S.label}>Phân tích USP<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span></div>
                  <textarea value={formData.usp || ""} onChange={(e) => setField("usp", e.target.value)} style={S.textarea} />
                </div>
                {/* Đánh giá thị trường — dynamic rows */}
                <div style={S.section}>
                  <div style={S.label}>Đánh giá thị trường</div>
                  {marketFields.map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}>
                      <input value={f.key} onChange={(e) => { const n = [...marketFields]; n[i] = { ...n[i], key: e.target.value }; setMarketFields(n); setDirty(true); }}
                        style={{ ...S.input, width: 120, flex: "none" }} />
                      <input value={smartFmt(f.value)} onChange={(e) => { const n = [...marketFields]; n[i] = { ...n[i], value: smartRaw(e.target.value, f.value) }; setMarketFields(n); setDirty(true); }}
                        style={{ ...S.input, flex: 1 }} />
                      <button type="button" onClick={() => { setMarketFields(marketFields.filter((_, j) => j !== i)); setDirty(true); }}
                        style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 14 }}>✕</button>
                    </div>
                  ))}
                  <div onClick={() => { setMarketFields([...marketFields, { key: "", value: "" }]); setDirty(true); }}
                    style={{ fontSize: 10, color: "#7C3AED", cursor: "pointer", fontWeight: 600 }}>+ Thêm trường</div>
                </div>
                {/* Phân tích nguồn hàng — dynamic rows */}
                <div style={S.section}>
                  <div style={S.label}>Phân tích nguồn hàng</div>
                  {supplyFields.map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}>
                      <input value={f.key} onChange={(e) => { const n = [...supplyFields]; n[i] = { ...n[i], key: e.target.value }; setSupplyFields(n); setDirty(true); }}
                        style={{ ...S.input, width: 120, flex: "none" }} />
                      <input value={smartFmt(f.value)} onChange={(e) => { const n = [...supplyFields]; n[i] = { ...n[i], value: smartRaw(e.target.value, f.value) }; setSupplyFields(n); setDirty(true); }}
                        style={{ ...S.input, flex: 1 }} />
                      <button type="button" onClick={() => { setSupplyFields(supplyFields.filter((_, j) => j !== i)); setDirty(true); }}
                        style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 14 }}>✕</button>
                    </div>
                  ))}
                  <div onClick={() => { setSupplyFields([...supplyFields, { key: "", value: "" }]); setDirty(true); }}
                    style={{ fontSize: 10, color: "#7C3AED", cursor: "pointer", fontWeight: 600 }}>+ Thêm trường</div>
                </div>
                {/* Giá nhập/bán + profit */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 }}>
                  <div style={S.section}>
                    <div style={S.label}>Giá nhập dự kiến<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span></div>
                    <input type="text" inputMode="numeric" value={fmtNum(formData.price_buy || "")} onChange={(e) => setField("price_buy", rawNum(e.target.value))} style={S.input} />
                  </div>
                  <div style={S.section}>
                    <div style={S.label}>Giá bán dự kiến<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span></div>
                    <input type="text" inputMode="numeric" value={fmtNum(formData.price_sell || "")} onChange={(e) => setField("price_sell", rawNum(e.target.value))} style={S.input} />
                  </div>
                </div>
                {(() => {
                  const buy = Number(rawNum(formData.price_buy || "0"));
                  const sell = Number(rawNum(formData.price_sell || "0"));
                  const margin = sell > 0 ? Math.round(((sell - buy) / sell) * 100) : 0;
                  const profit = sell - buy;
                  return (buy > 0 && sell > 0) ? (
                    <div style={{ padding: "6px 10px", background: "#F0FDF4", borderRadius: 6, marginBottom: 14, fontSize: 11, color: "#16A34A", fontWeight: 600 }}>
                      Biên lợi nhuận: ~{margin}% · Lãi/SP: ~{profit.toLocaleString("vi-VN")}đ
                    </div>
                  ) : null;
                })()}
                {/* Đánh giá chung */}
                <div style={S.section}>
                  <div style={S.label}>Đánh giá chung<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span></div>
                  <textarea value={formData.evaluation || ""} onChange={(e) => setField("evaluation", e.target.value)} style={{ ...S.textarea, minHeight: 50 }} />
                </div>
              </>
            ) : formFields.length > 0 && step.label !== "Nhập hàng" && step.label !== "Đặt hàng" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                {formFields.map((f) => renderField(f))}
              </div>
            ) : null}

            {/* ── QC Checklist (for Hàng về step) — skip if custom rendered ── */}
            {step.label !== "Hàng về" && step.label !== "QC & Nhận hàng" && step.label !== "Nhận mẫu & QC" && step.label !== "Nhập hàng" && step.label !== "Đặt hàng" && step.label !== "Đặt mẫu" && step.label !== "Chờ mẫu về" && resolvedLabel !== "Triển khai" && (checklist.length > 0 || isQcStep || step.label === "Tạo yêu cầu" || step.label === "Đề xuất") && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 5 }}>
                  {isQcStep ? `QC Checklist (${passCount}/${checklist.length} Pass${failCount > 0 ? ` · ${failCount} Fail` : ""})` : `Checklist (${checkedCount}/${checklist.length})`}
                </div>
                {checklist.length > 0 && (
                  <div style={{ height: 3, borderRadius: 2, background: "#E5E7EB", marginBottom: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, width: `${((isQcStep ? passCount : checkedCount) / checklist.length) * 100}%`, background: failCount > 0 ? "#DC2626" : (isQcStep ? passCount : checkedCount) === checklist.length ? "#16A34A" : "#3B82F6", transition: "width .2s" }} />
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {checklist.map((c, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 0", borderBottom: "1px solid #F1F5F9" }}>
                      <span style={{ flex: 1, fontSize: 11, color: c.verdict === "fail" ? "#DC2626" : c.verdict === "pass" ? "#94A3B8" : "#18181B" }}>{c.text}</span>
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
                      <button type="button" onClick={() => removeCheck(i)} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 14, padding: 2 }}>✕</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  <input value={newCheckLabel} onChange={(e) => setNewCheckLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCheckItem())} placeholder="Thêm mục kiểm tra..."
                    style={{ flex: 1, padding: "5px 11px", border: "1px solid #E2E8F0", borderRadius: 7, fontSize: 12, outline: "none" }} />
                  <button type="button" onClick={addCheckItem} style={{ padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#7C3AED", color: "#fff", cursor: "pointer" }}>+</button>
                </div>
              </div>
            )}

            {/* ── Links ── */}
            {step.label !== "Hàng về" && step.label !== "QC & Nhận hàng" && step.label !== "Nhập hàng" && step.label !== "Đặt hàng" && step.label !== "Đặt mẫu" && step.label !== "Chờ mẫu về" && !(step.label === "Nhận mẫu & QC" && !data.qc_confirmed) && (links.length > 0 || true) && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 5 }}>Tài liệu ({links.length})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
                  {links.map((link, i) => {
                    const url = getLinkUrl(link);
                    const tag = getLinkTag(link);
                    return (
                      <div key={i} style={{ padding: "3px 7px", background: "#F1F5F9", borderRadius: 5, fontSize: 9, display: "flex", alignItems: "center", gap: 3 }}>
                        <a href={url.startsWith("http") ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" style={{ color: "#3B82F6", textDecoration: "none" }}>
                          {tag || (url.length > 35 ? url.substring(0, 32) + "..." : url)}
                        </a>
                        <button type="button" onClick={() => removeLink(i)} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 10, padding: 0 }}>✕</button>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 3 }}>
                    <input value={newLink} onChange={(e) => setNewLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())} placeholder="Dán link..."
                      style={{ padding: "3px 7px", border: "1px dashed #D1D5DB", borderRadius: 5, fontSize: 9, width: 140, outline: "none" }} />
                    {newLink && <button type="button" onClick={addLink} style={{ padding: "3px 7px", borderRadius: 5, fontSize: 9, fontWeight: 600, border: "none", background: "#7C3AED", color: "#fff", cursor: "pointer" }}>+</button>}
                  </div>
                </div>
              </div>
            )}

            {/* ── Photos ── */}
            {step.label !== "Hàng về" && step.label !== "QC & Nhận hàng" && step.label !== "Nhập hàng" && step.label !== "Đặt hàng" && step.label !== "Đặt mẫu" && step.label !== "Chờ mẫu về" && !(step.label === "Nhận mẫu & QC" && !data.qc_confirmed) && (photos.length > 0 || true) && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 5 }}>Hình ảnh ({photos.length})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                  {photos.map((url, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      {isImageUrl(url) ? (
                        <div onClick={() => setPreviewImg(url)} style={{ cursor: "pointer" }}>
                          <img src={url} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid #E2E8F0" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                      ) : (
                        <div onClick={() => setPreviewImg(url)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 120, height: 120, borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", fontSize: 10, color: "#3B82F6", cursor: "pointer", padding: 6, textAlign: "center", wordBreak: "break-all" }}>
                          {url.length > 40 ? url.substring(0, 37) + "..." : url}
                        </div>
                      )}
                      <button type="button" onClick={() => removePhoto(i)} style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "#DC2626", color: "#fff", border: "none", fontSize: 9, cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
                    <input value={newPhoto} onChange={(e) => setNewPhoto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPhoto())} placeholder="Dán link ảnh..."
                      style={{ padding: "3px 7px", border: "1px dashed #D1D5DB", borderRadius: 5, fontSize: 9, width: 120, outline: "none" }} />
                    {newPhoto && <button type="button" onClick={addPhoto} style={{ padding: "3px 7px", borderRadius: 5, fontSize: 9, fontWeight: 600, border: "none", background: "#7C3AED", color: "#fff", cursor: "pointer" }}>+</button>}
                  </div>
                </div>
              </div>
            )}

            {/* ── Create PO banner ── */}
            {(step.label === "Nhập hàng" || step.label === "Nhập?" || step.label === "Đặt hàng") && (() => {
              const linkedBulkPo = String(data.linked_bulk_po || "");
              return (
              <>
                {/* Tạo đơn PO nhập hàng */}
                <div style={S.section}>
                  <div style={S.label}>Tạo đơn PO nhập hàng</div>
                  {!linkedBulkPo ? (
                    <div style={{ padding: 12, border: "2px dashed #BBF7D0", borderRadius: 10, textAlign: "center", cursor: "pointer" }}
                      onClick={() => openPoForm("bulk")}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>📦</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#16A34A" }}>Tạo đơn PO nhập hàng</div>
                      <div style={{ fontSize: 9, color: "#94A3B8" }}>Điền thông tin đơn hàng nhập</div>
                    </div>
                  ) : (
                    <div style={{ background: "#F0FDF4", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#16A34A" }}>Đơn PO đã tạo</div>
                      </div>
                      <div style={{ fontSize: 11, marginBottom: 2 }}>{linkedBulkPo} — {item.name || "SP nhập"}</div>
                      <a href={`/create?order_id=${linkedBulkPo}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: "#7C3AED", fontWeight: 600, textDecoration: "none" }}>Xem đơn ↗</a>
                    </div>
                  )}
                </div>
              </>
              );
            })()}

            </div>)}{/* end locked summary / editable form */}

            {/* ── Lịch sử bước (active/editable) ── */}
            {!isLocked && step.logs && step.logs.length > 0 && (
              <div style={{ marginTop: 14, marginBottom: 10, padding: "8px 10px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", marginBottom: 4 }}>Lịch sử</div>
                {step.logs.map((log, li) => {
                  const at = String(log.at || "");
                  const by = String(log.by || "");
                  const byName = users.find((u) => u.email === by)?.name || by;
                  const timeStr = at ? new Date(at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
                  const actionLabel = log.action === "complete" ? "✓ Hoàn thành"
                    : log.action === "activate" ? "▸ Bắt đầu"
                    : log.action === "revision" ? "↺ Yêu cầu chỉnh sửa"
                    : log.action === "reopened" ? "↺ Mở lại"
                    : log.action === "reject" ? "✕ Từ chối"
                    : String(log.action || "");
                  return (
                    <div key={li} style={{ fontSize: 10, color: "#64748B", padding: "2px 0", display: "flex", gap: 6, alignItems: "baseline" }}>
                      <span style={{ color: "#94A3B8", minWidth: 75, flexShrink: 0 }}>{timeStr}</span>
                      <span style={{ fontWeight: 600 }}>{actionLabel}</span>
                      <span>— {byName}</span>
                      {!!log.note && <span style={{ color: "#94A3B8", fontStyle: "italic" }}>&quot;{String(log.note).substring(0, 50)}&quot;</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Action buttons (normal steps only) ── */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 10, borderTop: "1px solid #E2E8F0" }}>
              {step.status === "approved" ? (
                <>
                  <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 600, padding: "7px 0" }}>✓ Bước hoàn thành</span>
                  <div style={{ flex: 1 }} />
                  {isLocked ? (
                    <button type="button" onClick={() => setEditingCompleted(true)} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "1px solid #D97706", background: "#fff", color: "#D97706", cursor: "pointer" }}>✏️ Sửa</button>
                  ) : (
                    <>
                      <button type="button" onClick={() => setEditingCompleted(false)} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#F1F5F9", color: "#64748B", cursor: "pointer" }}>Huỷ sửa</button>
                      <button type="button" onClick={save} disabled={pending || !dirty} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#7C3AED", color: "#fff", cursor: "pointer" }}>Cập nhật</button>
                    </>
                  )}
                  {activeIdx < initSteps.length - 1 && (
                    <button type="button" onClick={() => switchStep(activeIdx + 1)} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#3B82F6", color: "#fff", cursor: "pointer" }}>Bước tiếp →</button>
                  )}
                </>
              ) : (
                <>
                  <button type="button" onClick={save} disabled={pending || !dirty} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#F1F5F9", color: "#64748B", cursor: "pointer" }}>Lưu nháp</button>
                  {(() => {
                    const etaWait = step.label === "Chờ mẫu về";
                    const etaDate = String(data.sample_eta || "");
                    const etaArrived = etaDate && etaDate <= new Date().toISOString().substring(0, 10);
                    const qcNotConfirmed = step.label === "Nhận mẫu & QC" && !data.qc_confirmed;
                    const canComplete = (!etaWait || etaArrived) && !qcNotConfirmed;
                    const label = isLastStep ? "✓ Hoàn thành — Kết thúc"
                      : step.label === "Đặt mẫu" ? "Đã đặt mẫu — Chờ hàng về →"
                      : etaWait && etaArrived ? "Đã về — Chuyển QC →"
                      : etaWait ? "Chưa đến ETA — Chờ hàng về"
                      : step.label === "Nhận mẫu & QC" ? "Gửi sếp duyệt →"
                      : "Hoàn thành & Chuyển bước →";
                    return (
                      <button type="button" onClick={markComplete} disabled={pending || !canComplete}
                        style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none",
                          background: canComplete ? "#7C3AED" : "#E2E8F0", color: canComplete ? "#fff" : "#94A3B8", cursor: canComplete ? "pointer" : "not-allowed" }}>
                        {label}
                      </button>
                    );
                  })()}
                </>
              )}
            </div>

            </>)}  {/* end !isApprovalStep */}
          </div>
        </div>
      </div>

      {/* ═══ IMAGE PREVIEW POPUP ═══ */}
      {previewImg && (
        <div onClick={(e) => { e.stopPropagation(); setPreviewImg(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 10002, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <img src={previewImg} alt="" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8, objectFit: "contain" }} onClick={(e) => e.stopPropagation()} />
          <button type="button" onClick={() => setPreviewImg("")} style={{ position: "absolute", top: 16, right: 16, width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,.2)", color: "#fff", border: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* ═══ PO SIMPLE POPUP FORM ═══ */}
      {showPoForm && (
        <div onClick={() => setShowPoForm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: 780, maxWidth: "96vw", boxShadow: "0 25px 70px rgba(0,0,0,.3)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#F5F3FF", borderBottom: "1px solid #E2E8F0" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#7C3AED" }}>📦 {poMode === "bulk" ? "Tạo đơn PO nhập hàng" : "Tạo đơn PO mua mẫu"}</span>
              <button type="button" onClick={() => setShowPoForm(false)} style={{ padding: "2px 8px", borderRadius: 5, fontSize: 12, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              {/* Row 1: Mã đơn | Người phụ trách | Thanh toán | Phân loại hàng */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                <div style={S.section}>
                  <div style={S.label}>Mã đơn</div>
                  <input type="text" value="Tự sinh khi lưu" readOnly style={{ ...S.input, background: "#F8FAFC", color: "#94A3B8" }} />
                </div>
                <div style={S.section}>
                  <div style={S.label}>Người phụ trách</div>
                  <select value={poOwner} onChange={(e) => setPoOwner(e.target.value)} style={S.select}>
                    {users.map((u) => <option key={u.email} value={u.email}>{u.name || u.email}</option>)}
                  </select>
                </div>
                <div style={S.section}>
                  <div style={S.label}>Thanh toán</div>
                  <select value={poPayStatus} onChange={(e) => setPoPayStatus(e.target.value)} style={S.select}>
                    {["Chưa thanh toán", "Đã cọc", "Đã thanh toán", "Công nợ"].map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div style={S.section}>
                  <div style={S.label}>Phân loại hàng</div>
                  <select value={poGoodsType} onChange={(e) => setPoGoodsType(e.target.value)} style={S.select}>
                    {["Trung Quốc trữ sẵn", "Trung Quốc đặt hàng", "Nội địa", "Hàng mẫu", "Hàng sản xuất"].map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              {/* Row 2: Tên đơn | Nhà cung cấp */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={S.section}>
                  <div style={S.label}>Tên đơn<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span></div>
                  <input type="text" value={poName} onChange={(e) => setPoName(e.target.value)} placeholder="VD: Lô máy chiếu HY320 tháng 3/2026" style={S.input} />
                </div>
                <div style={S.section}>
                  <div style={S.label}>Nhà cung cấp<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span></div>
                  <SupplierPicker suppliers={suppliers} value={poSupplier} onChange={setPoSupplier} />
                </div>
              </div>
              {/* Row 3: Ngày đặt | ETA | Ngày về thực tế | Tiền cọc */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                <div style={S.section}>
                  <div style={S.label}>Ngày đặt</div>
                  <input type="date" value={poOrderDate} onChange={(e) => setPoOrderDate(e.target.value)} style={S.input} />
                </div>
                <div style={S.section}>
                  <div style={S.label}>ETA (dự kiến về)<span style={{ color: "#DC2626", marginLeft: 2 }}>*</span></div>
                  <input type="date" value={deadlineToISO(poEta)} onChange={(e) => setPoEta(e.target.value)} style={S.input} />
                </div>
                <div style={S.section}>
                  <div style={S.label}>Ngày về thực tế</div>
                  <input type="date" value={poArrivalDate} onChange={(e) => setPoArrivalDate(e.target.value)} style={S.input} />
                </div>
                <div style={S.section}>
                  <div style={S.label}>Tiền cọc (đ)</div>
                  <input type="text" inputMode="numeric" value={fmtNum(poDeposit)} onChange={(e) => setPoDeposit(rawNum(e.target.value))} style={S.input} />
                </div>
              </div>
              {/* Row 4: Ghi chú */}
              <div style={S.section}>
                <div style={S.label}>Ghi chú</div>
                <textarea value={poNote} onChange={(e) => setPoNote(e.target.value)} placeholder="Ghi chú..." style={S.textarea} />
              </div>
              {/* Actions */}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 10, borderTop: "1px solid #E2E8F0" }}>
                <button type="button" onClick={() => setShowPoForm(false)} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#F1F5F9", color: "#64748B", cursor: "pointer" }}>Huỷ</button>
                <button type="button" disabled={pending} onClick={() => {
                  const poMissing: string[] = [];
                  if (!poName.trim()) poMissing.push("Tên đơn");
                  if (!poSupplier.trim()) poMissing.push("Nhà cung cấp");
                  if (!poEta) poMissing.push("ETA (dự kiến về)");
                  if (poMissing.length > 0) {
                    alert("Chưa đủ thông tin tạo PO:\n\n• " + poMissing.join("\n• "));
                    return;
                  }
                  startTransition(async () => {
                    const isBulk = poMode === "bulk";
                    const etaKey = isBulk ? "bulk_eta" : "sample_eta";
                    const linkKey = isBulk ? "linked_bulk_po" : "linked_sample_po";
                    const preData = { ...data, ...formData, [etaKey]: poEta || formData[etaKey] || data[etaKey], [stepsKey]: JSON.stringify(buildUpdatedSteps()) };
                    await saveRdItemAction(item.id, { name: itemName, data: preData });
                    const r = await createSamplePoAction(item.id, {
                      order_name: poName, owner: poOwner, pay_status: poPayStatus,
                      goods_type: poGoodsType, supplier_name: poSupplier,
                      order_date: poOrderDate, eta_date: poEta, arrival_date: poArrivalDate,
                      deposit_amount: Number(poDeposit) || 0, note: poNote,
                      mode: poMode,
                    });
                    if (r.ok) {
                      (data as Record<string, unknown>)[linkKey] = r.orderId;
                      (data as Record<string, unknown>)[etaKey] = poEta;
                      setShowPoForm(false);
                      onRefresh();
                    } else alert(r.error || "Lỗi tạo đơn");
                  });
                }} style={{ padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, border: "none", background: "#7C3AED", color: "#fff", cursor: "pointer" }}>
                  {pending ? "Đang tạo..." : "Tạo đơn PO"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
