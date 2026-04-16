import { listReturns } from "@/lib/db/returns";
import ReturnsView from "./ReturnsView";

export const dynamic = "force-dynamic";

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const returns = await listReturns(status);
  return <ReturnsView items={returns} statusFilter={status || ""} />;
}
