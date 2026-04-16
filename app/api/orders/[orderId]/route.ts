import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { getOrder } from "@/lib/db/orders";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ orderId: string }> },
) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { orderId } = await ctx.params;
  const res = await getOrder(orderId);
  if (!res) return NextResponse.json({ ok: false, error: "Không tìm thấy đơn" }, { status: 404 });
  // Kiểm tra đã có phiếu triển khai chưa
  const { count } = await supabaseAdmin()
    .from("deployments")
    .select("*", { count: "exact", head: true })
    .eq("order_id", orderId);
  return NextResponse.json({
    ok: true,
    order: res.order,
    items: res.items,
    has_deployments: (count || 0) > 0,
    deployment_count: count || 0,
  });
}
