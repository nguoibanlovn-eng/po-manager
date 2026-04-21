import { listDamageItems } from "@/lib/db/finance";
import { supabaseAdmin } from "@/lib/supabase/admin";
import DamageMgmtView from "./DamageMgmtView";

export const dynamic = "force-dynamic";

export default async function DamageMgmtPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "pending" } = await searchParams;
  const pending = tab === "pending";
  const db = supabaseAdmin();

  const [items, usersRes] = await Promise.all([
    listDamageItems({ pending }),
    db.from("users").select("email, name, role, team").eq("is_active", true).order("name"),
  ]);

  // Lấy thêm info đơn (arrival_date) để hiển thị header group
  const orderIds = Array.from(new Set(items.map((it) => it.order_id)));
  const ordersData = orderIds.length
    ? (await db.from("orders").select("order_id, arrival_date, order_date").in("order_id", orderIds)).data || []
    : [];
  const metaMap: Record<string, { arrival_date: string | null; order_date: string | null }> = {};
  for (const o of ordersData) metaMap[o.order_id] = { arrival_date: o.arrival_date, order_date: o.order_date };

  const users = (usersRes.data || []).map((u) => ({ email: u.email as string, name: (u.name || u.email) as string, team: (u.team || "") as string }));

  return (
    <DamageMgmtView
      items={items}
      tab={pending ? "pending" : "done"}
      orderMeta={metaMap}
      users={users}
    />
  );
}
