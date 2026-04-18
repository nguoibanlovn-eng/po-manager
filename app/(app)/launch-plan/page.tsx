import { listLaunchPlans, backfillLaunchFromDeploys } from "@/lib/db/plans";
import LaunchPlanView from "./LaunchPlanView";

export const dynamic = "force-dynamic";

export default async function LaunchPlanPage() {
  // Backfill: create launch plans for deployments that finished info but have no plan yet
  try { await backfillLaunchFromDeploys(); } catch (e) { console.warn("Backfill error:", (e as Error).message); }

  const plans = await listLaunchPlans();
  return <LaunchPlanView plans={plans} />;
}
