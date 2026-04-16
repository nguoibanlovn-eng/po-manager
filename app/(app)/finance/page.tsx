import { listDebtOrders, listDamageItems } from "@/lib/db/finance";
import FinanceView from "./FinanceView";

export const dynamic = "force-dynamic";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "debt" } = await searchParams;
  const [debtOrders, damagePending, damageDone] = await Promise.all([
    listDebtOrders(),
    listDamageItems({ pending: true }),
    listDamageItems({ pending: false }),
  ]);
  return (
    <FinanceView
      tab={tab === "damage" ? "damage" : "debt"}
      debtOrders={debtOrders}
      damagePending={damagePending}
      damageDone={damageDone}
    />
  );
}
