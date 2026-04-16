import { listRdItems } from "@/lib/db/rd";
import RdView from "./RdView";

export const dynamic = "force-dynamic";

export default async function RdPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const items = await listRdItems(stage);
  return <RdView items={items} filterStage={stage || ""} />;
}
