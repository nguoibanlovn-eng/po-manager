import { listLaunchPlans } from "@/lib/db/plans";
import LaunchPlanView from "./LaunchPlanView";

export const dynamic = "force-dynamic";

export default async function LaunchPlanPage() {
  const rows = await listLaunchPlans();
  return <LaunchPlanView rows={rows} />;
}
