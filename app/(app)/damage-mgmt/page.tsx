import { listDamageItems } from "@/lib/db/finance";
import DamageMgmtView from "./DamageMgmtView";

export const dynamic = "force-dynamic";

export default async function DamageMgmtPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "pending" } = await searchParams;
  const pending = tab === "pending";
  const items = await listDamageItems({ pending });
  return <DamageMgmtView items={items} tab={pending ? "pending" : "done"} />;
}
