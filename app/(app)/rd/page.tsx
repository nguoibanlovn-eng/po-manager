import { listRdItems } from "@/lib/db/rd";
import { listActiveUsers } from "@/lib/db/users";
import { getCurrentUser } from "@/lib/auth/user";
import RdView from "./RdView";

export const dynamic = "force-dynamic";

export default async function RdPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const [items, users, currentUser] = await Promise.all([listRdItems(stage), listActiveUsers(), getCurrentUser()]);
  return <RdView items={items} users={users} filterStage={stage || ""} currentUserRole={currentUser?.role || "VIEWER"} currentUserEmail={currentUser?.email || ""} />;
}
