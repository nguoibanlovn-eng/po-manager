import { listRdItems } from "@/lib/db/rd";
import { listActiveUsers } from "@/lib/db/users";
import { listSuppliers } from "@/lib/db/suppliers";
import { getCurrentUser } from "@/lib/auth/user";
import RdView from "./RdView";

export const dynamic = "force-dynamic";

export default async function RdPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const [items, users, currentUser, suppliers] = await Promise.all([listRdItems(stage), listActiveUsers(), getCurrentUser(), listSuppliers()]);
  return <RdView items={items} users={users} suppliers={suppliers} filterStage={stage || ""} currentUserRole={currentUser?.role || "VIEWER"} currentUserEmail={currentUser?.email || ""} />;
}
