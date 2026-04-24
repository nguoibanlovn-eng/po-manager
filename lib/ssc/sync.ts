import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sscGetToken, sscGetAvailableBatch } from "./client";

/**
 * Sync SSC inventory into products.stock_ssc.
 * Queries all active SKUs against SSC API, updates stock_ssc and recalculates stock.
 */
export async function syncSscInventory(): Promise<{
  total: number;
  found: number;
  updated: number;
  logs: string[];
}> {
  const logs: string[] = [];
  const db = supabaseAdmin();

  // Paginate to get ALL active products (Supabase default limit = 1000)
  logs.push("[SSC] Đọc danh sách sản phẩm...");
  const allProducts: Array<{ id: number; sku: string; stock_kho_tru: number; stock_ssc: number }> = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await db
      .from("products")
      .select("id, sku, stock_kho_tru, stock_ssc")
      .eq("is_active", true)
      .neq("sku", "")
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    allProducts.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  if (!allProducts.length) return { total: 0, found: 0, updated: 0, logs: ["Không có sản phẩm"] };
  logs.push(`[SSC] ${allProducts.length} sản phẩm active`);

  // Unique barcodes
  const skuSet = new Set<string>();
  for (const p of allProducts) {
    if (p.sku) skuSet.add(p.sku);
  }
  const barcodes = [...skuSet];
  logs.push(`[SSC] ${barcodes.length} SKU unique cần query SSC`);

  logs.push("[SSC] Lấy token...");
  const token = await sscGetToken();
  logs.push("[SSC] Token OK, bắt đầu query tồn kho...");

  const sscMap = await sscGetAvailableBatch(barcodes, token);
  logs.push(`[SSC] Tìm thấy ${sscMap.size}/${barcodes.length} SKU có trên SSC`);

  // Update products where SSC qty changed
  let updated = 0;
  let skipped = 0;
  for (const p of allProducts) {
    const sscQty = sscMap.get(p.sku) ?? 0;
    const khoTru = Number(p.stock_kho_tru) || 0;
    const oldSsc = Number(p.stock_ssc) || 0;
    if (sscQty === oldSsc) { skipped++; continue; }
    const { error: uErr } = await db
      .from("products")
      .update({ stock_ssc: sscQty, stock: khoTru + sscQty })
      .eq("id", p.id);
    if (!uErr) updated++;
  }

  logs.push(`[SSC] Cập nhật ${updated} SP, bỏ qua ${skipped} (không đổi)`);
  return { total: barcodes.length, found: sscMap.size, updated, logs };
}
