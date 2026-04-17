import { listRdItems } from "@/lib/db/rd";
import { listActiveUsers } from "@/lib/db/users";
import RdView from "./RdView";

export const dynamic = "force-dynamic";

export default async function RdPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const [items, users] = await Promise.all([listRdItems(stage), listActiveUsers()]);
  return <RdView items={items} users={users} filterStage={stage || ""} />;
}
