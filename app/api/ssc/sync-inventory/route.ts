import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sscGetToken, sscGetAvailableBatch } from "@/lib/ssc/client";

export const maxDuration = 300;

export async function POST() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
      };

      try {
        const db = supabaseAdmin();
        const t0 = Date.now();

        send("[SSC] Đọc danh sách sản phẩm...");
        const allProducts: Array<{ id: number; sku: string; stock_kho_tru: number; stock_ssc: number }> = [];
        let offset = 0;
        while (true) {
          const { data, error } = await db
            .from("products")
            .select("id, sku, stock_kho_tru, stock_ssc")
            .eq("is_active", true)
            .neq("sku", "")
            .order("id")
            .range(offset, offset + 999);
          if (error) throw error;
          if (!data?.length) break;
          allProducts.push(...data);
          if (data.length < 1000) break;
          offset += 1000;
        }
        send(`[SSC] ${allProducts.length} sản phẩm active`);

        const skuSet = new Set<string>();
        for (const p of allProducts) if (p.sku) skuSet.add(p.sku);
        const barcodes = [...skuSet];
        send(`[SSC] ${barcodes.length} SKU unique`);

        send("[SSC] Lấy token...");
        const token = await sscGetToken();
        send("[SSC] Token OK — bắt đầu query SSC...");

        const sscMap = await sscGetAvailableBatch(barcodes, token, 10);
        send(`[SSC] Tìm thấy ${sscMap.size}/${barcodes.length} SKU có trên SSC`);

        send("[SSC] Đang cập nhật DB...");
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

        const duration = ((Date.now() - t0) / 1000).toFixed(1);
        send(`[SSC] ✓ Hoàn tất: ${updated} cập nhật, ${skipped} không đổi — ${duration}s`);

        // Final JSON result
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ __done: true, ok: true, total: barcodes.length, found: sscMap.size, updated })}\n\n`));
      } catch (e) {
        send(`[SSC] ❌ Lỗi: ${e instanceof Error ? e.message : String(e)}`);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ __done: true, ok: false, error: String(e) })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
