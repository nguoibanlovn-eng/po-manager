import { getCurrentUser } from "@/lib/auth/user";
import { getOrder } from "@/lib/db/orders";
import { listSuppliers } from "@/lib/db/suppliers";
import { listActiveUsers } from "@/lib/db/users";
import OrderForm from "./OrderForm";

export const dynamic = "force-dynamic";

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const { order_id } = await searchParams;
  const [user, suppliers, users, loaded] = await Promise.all([
    getCurrentUser(),
    listSuppliers(),
    listActiveUsers(),
    order_id ? getOrder(order_id) : Promise.resolve(null),
  ]);

  return (
    <OrderForm
      user={user ? { email: user.email, name: user.name, role: user.role } : null}
      order={loaded?.order ?? null}
      items={loaded?.items ?? []}
      suppliers={suppliers}
      users={users}
    />
  );
}
