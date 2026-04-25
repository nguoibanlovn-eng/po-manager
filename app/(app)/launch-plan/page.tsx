import { listLaunchPlans, backfillLaunchFromDeploys } from "@/lib/db/plans";
import LaunchPlanView from "./LaunchPlanView";

export const dynamic = "force-dynamic";

export default async function LaunchPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; name?: string; cost?: string }>;
}) {
  const sp = await searchParams;
  // Backfill: create launch plans for deployments that finished info but have no plan yet
  try { await backfillLaunchFromDeploys(); } catch (e) { console.warn("Backfill error:", (e as Error).message); }

  const plans = await listLaunchPlans();
  const autoAdd = sp.add ? { sku: sp.add, name: sp.name || "", cost: Number(sp.cost) || 0 } : undefined;
  return <LaunchPlanView plans={plans} autoAdd={autoAdd} />;
}
