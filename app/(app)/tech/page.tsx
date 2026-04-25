import { listOrderItemsForQc, listTechTasks } from "@/lib/db/tech";
import TechView from "./TechView";

export const dynamic = "force-dynamic";

export default async function TechPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "active" } = await searchParams;
  const done = tab === "done";
  const [orders, activeOrders, doneOrders] = await Promise.all([
    listTechTasks(done),
    listTechTasks(false),
    listTechTasks(true),
  ]);

  // Preload items
  const itemsByOrder: Record<string, Awaited<ReturnType<typeof listOrderItemsForQc>>> = {};
  await Promise.all(
    orders.map(async (o) => {
      itemsByOrder[o.order_id] = await listOrderItemsForQc(o.order_id);
    }),
  );

  return <TechView orders={orders} itemsByOrder={itemsByOrder} activeTab={done ? "done" : "active"} activeCount={activeOrders.length} doneCount={doneOrders.length} />;
}
