import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type MyTaskItem = {
  kind: "order_action" | "damage_pending" | "assignment" | "deploy_pending" | "task";
  title: string;
  sub: string;
  href: string;
  badge?: string;
  badgeColor?: string;
};

export async function listMyTasks(email: string): Promise<MyTaskItem[]> {
  const db = supabaseAdmin();
  const out: MyTaskItem[] = [];

  // 1. Orders I own that need action (stage ARRIVED / QC_DONE / ON_SHELF)
  const { data: myOrders = [] } = await db
    .from("orders")
    .select("order_id, order_name, stage, supplier_name")
    .eq("is_deleted", false)
    .eq("owner", email)
    .in("stage", ["ARRIVED", "QC_DONE", "ON_SHELF"]);
  for (const o of myOrders || []) {
    out.push({
      kind: "order_action",
      title: `${o.order_id} — ${o.order_name || ""}`,
      sub: `Giai đoạn: ${o.stage} · NCC: ${o.supplier_name || "—"}`,
      href: `/create?order_id=${o.order_id}`,
      badge: o.stage || undefined,
    });
  }

  // 2. Damage items on my orders that are still pending
  const { data: myOrderIds } = await db
    .from("orders")
    .select("order_id")
    .eq("owner", email)
    .eq("is_deleted", false);
  const ids = (myOrderIds || []).map((o) => o.order_id);
  if (ids.length) {
    const { data: dmgItems = [] } = await db
      .from("items")
      .select("order_id, line_id, product_name, damage_qty, damage_amount, resolution_status")
      .in("order_id", ids)
      .eq("is_deleted", false)
      .gt("damage_qty", 0)
      .eq("damage_handled", false);
    for (const it of dmgItems || []) {
      out.push({
        kind: "damage_pending",
        title: `Hỏng: ${it.product_name}`,
        sub: `Đơn ${it.order_id} · ${it.damage_qty} cái · ${(it.damage_amount || 0).toLocaleString("vi-VN")}₫`,
        href: `/finance?tab=damage`,
        badge: "Chờ xử lý",
        badgeColor: "chip-red",
      });
    }
  }

  // 3. Assignments assigned to me
  const { data: myAssignments = [] } = await db
    .from("assignments")
    .select("assign_id, order_id, sku, channel, status, note")
    .eq("assigned_email", email)
    .neq("status", "done");
  for (const a of myAssignments || []) {
    out.push({
      kind: "assignment",
      title: `Assignment: ${a.sku || a.assign_id}`,
      sub: `Đơn ${a.order_id} · Kênh: ${a.channel || "—"}`,
      href: `/create?order_id=${a.order_id}`,
      badge: a.status || "pending",
      badgeColor: "chip-amber",
    });
  }

  // 4. Deployments created by me that are not done
  const { data: myDeploys = [] } = await db
    .from("deployments")
    .select("deploy_id, order_id, product_name, status")
    .eq("created_by", email)
    .neq("status", "done")
    .limit(100);
  for (const d of myDeploys || []) {
    out.push({
      kind: "deploy_pending",
      title: `Triển khai: ${d.product_name || d.deploy_id}`,
      sub: `Đơn ${d.order_id} · ${d.status}`,
      href: `/deploy`,
      badge: d.status || "pending",
      badgeColor: d.status === "in_progress" ? "chip-amber" : "chip-gray",
    });
  }

  // 5. Regular tasks assigned to me (Tasks Manager, Phase 4 but already seeded)
  const { data: myTasks = [] } = await db
    .from("tasks")
    .select("task_id, title, status, deadline, priority")
    .eq("assignee_email", email)
    .neq("status", "DONE")
    .neq("status", "CANCELLED");
  for (const t of myTasks || []) {
    out.push({
      kind: "task",
      title: t.title || "(Không tiêu đề)",
      sub: `Deadline: ${t.deadline ? new Date(t.deadline).toLocaleDateString("vi-VN") : "—"}`,
      href: `/tasks`,
      badge: t.priority || t.status || undefined,
      badgeColor: t.priority === "URGENT" ? "chip-red" : "chip-blue",
    });
  }

  return out;
}
