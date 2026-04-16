// Types + pipeline helpers cho R&D — không import "server-only" để client dùng được.

export type RdItem = {
  id: string;
  name: string | null;
  source_url: string | null;
  stage: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  data: Record<string, unknown> | null;
  rd_type: string | null;
  current_step: string | null;
  step_completed_at: Record<string, string> | null;
  step_data: Record<string, Record<string, unknown>> | null;
  checklists: Record<string, Array<{ label: string; checked: boolean; note?: string }>> | null;
};

export const RESEARCH_PIPELINE = [
  { key: "nghien_cuu",    label: "Nghiên cứu" },
  { key: "duyet_de_xuat", label: "Duyệt đề xuất" },
  { key: "dat_mau",       label: "Đặt mẫu" },
  { key: "kiem_tra",      label: "Kiểm tra" },
  { key: "nhap",          label: "Nhập?" },
  { key: "ket_qua",       label: "Kết quả" },
];

export const PRODUCTION_PIPELINE = [
  { key: "tao_ticket",    label: "Tạo ticket" },
  { key: "nghien_cuu",    label: "Nghiên cứu" },
  { key: "duyet_b1",      label: "Duyệt B1" },
  { key: "giao_tk",       label: "Giao TK" },
  { key: "thiet_ke",      label: "Thiết kế" },
  { key: "duyet_2a",      label: "Duyệt 2A" },
  { key: "ncc_tracking",  label: "NCC+Tracking" },
  { key: "cho_mau_ve",    label: "Chờ mẫu về" },
  { key: "duyet_mau",     label: "Duyệt mẫu" },
  { key: "dat_hang",      label: "Đặt hàng" },
];

export function getPipeline(rdType: string | null | undefined) {
  const t = String(rdType || "").toLowerCase();
  return t === "production" || t === "upgrade" ? PRODUCTION_PIPELINE : RESEARCH_PIPELINE;
}
