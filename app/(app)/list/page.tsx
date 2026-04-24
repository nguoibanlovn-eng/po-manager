import { getCurrentUser } from "@/lib/auth/user";
import { listOrders } from "@/lib/db/orders";
import { listSuppliers } from "@/lib/db/suppliers";
import { listActiveUsers } from "@/lib/db/users";
import OrdersView from "./OrdersView";

export const dynamic = "force-dynamic";

export default async function ListPage() {
  const [user, orders, suppliers, users] = await Promise.all([
    getCurrentUser(),
    listOrders({ limit: 500 }),
    listSuppliers(),
    listActiveUsers(),
  ]);
  return (
    <OrdersView
      orders={orders}
      userRole={user?.role || ""}
      user={user ? { email: user.email, name: user.name, role: user.role } : null}
      suppliers={suppliers}
      users={users}
    />
  );
}
