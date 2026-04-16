import "server-only";
import { nhanhReq } from "./client";
import { toNum } from "@/lib/format";
import { dateVN } from "@/lib/helpers";

export type NhanhBillSummary = {
  id: string;
  supplier: string;
  created_date: string;
  item_count: number;
};

export type NhanhBillDetail = {
  id: string;
  supplier: string;
  created_date: string;
  total: number;
  zero_price_count: number;
  products: Array<{
    sku: string;
    product_name: string;
    qty: number;
    unit_price: number;
  }>;
};

type BillRow = {
  id?: string | number;
  date?: string;
  supplier?: { name?: string };
  created?: { name?: string };
  products?: Array<unknown>;
};

type ImexRow = {
  date?: string;
  supplier?: { name?: string };
  quantity?: string | number;
  avgCost?: string | number;
  productPrice?: string | number;
  product?: {
    barcode?: string;
    code?: string;
    name?: string;
    prices?: { import?: string | number };
  };
};

export async function listNhanhBills(): Promise<NhanhBillSummary[]> {
  const r = await nhanhReq<BillRow[]>("/bill/list", {
    filters: { type: 1, createdFrom: dateVN(null, -30), createdTo: dateVN() },
    paginator: { size: 50 },
  });
  if (r.code !== 1 || !r.data) return [];
  const arr: BillRow[] = Array.isArray(r.data) ? r.data : (Object.values(r.data as Record<string, BillRow>));
  return arr.map((b) => ({
    id: String(b.id || ""),
    supplier: b.supplier?.name || b.created?.name || "",
    created_date: String(b.date || "").substring(0, 10),
    item_count: b.products?.length || 0,
  }));
}

export async function getNhanhBill(billId: string): Promise<NhanhBillDetail | null> {
  const rBill = await nhanhReq<BillRow[]>("/bill/list", {
    filters: { ids: [Number(billId)] },
    paginator: { size: 1 },
  });
  const billHeader =
    rBill.code === 1 && Array.isArray(rBill.data) && rBill.data.length ? rBill.data[0] : null;

  const r = await nhanhReq<ImexRow[]>("/bill/imexs", { filters: { billId: Number(billId) } });
  const data = r.code === 1 && Array.isArray(r.data) ? r.data : [];
  if (!data.length) return null;

  const first = data[0];
  const supplierName =
    billHeader?.supplier?.name || first.supplier?.name || "";
  const createdDate = billHeader?.date
    ? String(billHeader.date).substring(0, 10)
    : first.date
      ? String(first.date).substring(0, 10)
      : "";

  const products = data.map((row) => {
    const p = row.product || {};
    return {
      sku: String(p.barcode || p.code || ""),
      product_name: String(p.name || ""),
      qty: toNum(row.quantity),
      unit_price: toNum(row.avgCost || p.prices?.import || row.productPrice),
    };
  });
  const zeroPriceCount = products.filter((p) => p.unit_price === 0).length;
  const total = products.reduce((s, p) => s + p.qty * p.unit_price, 0);

  return {
    id: String(billId),
    supplier: supplierName,
    created_date: createdDate,
    total,
    zero_price_count: zeroPriceCount,
    products,
  };
}
