// Domain types — ported from gs.txt HDR constants.

export type OrderStage =
  | "DRAFT" | "ORDERED" | "ARRIVED" | "QC_DONE"
  | "ON_SHELF" | "SELLING" | "COMPLETED";

export type PayStatus =
  | "Chưa thanh toán" | "Đã cọc" | "Đã thanh toán" | "Công nợ";

export type Order = {
  order_id: string;
  created_at: string | null;
  created_by: string | null;
  updated_at: string | null;
  owner: string | null;
  order_name: string | null;
  supplier_name: string | null;
  supplier_contact: string | null;
  pay_status: PayStatus | string | null;
  deposit_amount: number | string | null;
  payment_date: string | null;
  finance_note: string | null;
  order_date: string | null;
  eta_date: string | null;
  arrival_date: string | null;
  item_count: number | string | null;
  total_qty: number | string | null;
  order_total: number | string | null;
  return_cost_total: number | string | null;
  damage_cost_total: number | string | null;
  total_loss: number | string | null;
  stage: OrderStage | string | null;
  order_status: string | null;
  note: string | null;
  goods_type: string | null;
  is_deleted: boolean | null;
  deleted_at: string | null;
  deleted_by: string | null;
  is_locked: boolean | null;
  unlock_requested_by: string | null;
  unlock_reason: string | null;
  unlock_approved_by: string | null;
  unlock_approved_at: string | null;
};

export type Item = {
  order_id: string;
  line_id: string;
  stt: number | string | null;
  sku: string | null;
  product_name: string | null;
  link: string | null;
  item_type: string | null;
  qty: number | string | null;
  unit_price: number | string | null;
  line_total: number | string | null;
  qc_status: string | null;
  damage_qty: number | string | null;
  damage_amount: number | string | null;
  damage_handled: boolean | null;
  damage_note: string | null;
  shelf_done: boolean | null;
  return_status: string | null;
  return_cost: number | string | null;
  note: string | null;
  is_deleted: boolean | null;
  resolution_type: string | null;
  resolution_status: string | null;
  resolution_evidence: string | null;
  resolved_amount: number | string | null;
  resolved_date: string | null;
  replacement_bill_id: string | null;
  replacement_qty: number | string | null;
  liquidation_sku: string | null;
  liquidation_bill_id: string | null;
  finance_confirmed: boolean | null;
  ticket_sent_at: string | null;
  kt_note: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_account_name: string | null;
  refund_method: string | null;
};

// Enriched view for list page (computed joins with items).
export type OrderListItem = Order & {
  item_count: number;
  total_qty: number;
  damage_cost_total: number;
  has_damage: boolean;
  damage_pending: boolean;
  damage_handled_all: boolean;
  item_names: string;
};
