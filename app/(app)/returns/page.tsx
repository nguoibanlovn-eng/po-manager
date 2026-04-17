import { listReturns } from "@/lib/db/returns";
import ReturnsView from "./ReturnsView";

export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  const items = await listReturns();
  return <ReturnsView items={items} />;
}
