import { requireUser } from "@/lib/auth/user";
import { listBizOrders } from "@/lib/db/biz-orders";
import { listActiveUsers } from "@/lib/db/users";
import BizOrdersView from "./BizOrdersView";

export default async function BizOrdersPage() {
  const [user, orders, users] = await Promise.all([
    requireUser(),
    listBizOrders(),
    listActiveUsers(),
  ]);

  return <BizOrdersView user={user} orders={orders} users={users} />;
}
