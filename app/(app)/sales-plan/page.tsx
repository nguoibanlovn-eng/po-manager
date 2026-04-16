import { listSalesPlans } from "@/lib/db/plans";
import { dateVN } from "@/lib/helpers";
import SalesPlanView from "./SalesPlanView";

export const dynamic = "force-dynamic";

export default async function SalesPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const monthKey = month || dateVN().substring(0, 7);
  const rows = await listSalesPlans(monthKey);
  return <SalesPlanView rows={rows} monthKey={monthKey} />;
}
