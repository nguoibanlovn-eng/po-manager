import { listLaunchPlans } from "@/lib/db/plans";
import LaunchPlanView from "./LaunchPlanView";

export const dynamic = "force-dynamic";

export default async function LaunchPlanPage() {
  const plans = await listLaunchPlans();
  return <LaunchPlanView plans={plans} />;
}
