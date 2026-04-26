import { listLaunchPlans, backfillLaunchFromDeploys } from "@/lib/db/plans";
import { listActiveUsers } from "@/lib/db/users";
import { requireUser } from "@/lib/auth/user";
import LaunchPlanView from "./LaunchPlanView";

export const dynamic = "force-dynamic";

export default async function LaunchPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; name?: string; cost?: string }>;
}) {
  const sp = await searchParams;
  try { await backfillLaunchFromDeploys(); } catch (e) { console.warn("Backfill error:", (e as Error).message); }

  const [plans, users, currentUser] = await Promise.all([listLaunchPlans(), listActiveUsers(), requireUser()]);
  const autoAdd = sp.add ? { sku: sp.add, name: sp.name || "", cost: Number(sp.cost) || 0 } : undefined;
  return <LaunchPlanView plans={plans} autoAdd={autoAdd} users={users} currentUserRole={currentUser.role} />;
}
