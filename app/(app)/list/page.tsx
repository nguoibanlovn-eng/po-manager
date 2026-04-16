import { getCurrentUser } from "@/lib/auth/user";
import { listOrders } from "@/lib/db/orders";
import OrdersView from "./OrdersView";

export const dynamic = "force-dynamic";

export default async function ListPage() {
  const [user, orders] = await Promise.all([
    getCurrentUser(),
    listOrders({ limit: 500 }),
  ]);
  return <OrdersView orders={orders} userRole={user?.role || ""} />;
}
