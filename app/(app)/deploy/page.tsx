import { listDeployments } from "@/lib/db/deploy";
import { getCurrentUser } from "@/lib/auth/user";
import { hasPermission } from "@/lib/auth/roles";
import DeployView from "./DeployView";

export const dynamic = "force-dynamic";

export default async function DeployPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const user = await getCurrentUser();
  const groups = await listDeployments();
  const canApprove = hasPermission(user, "approve_deploy") || user?.role === "ADMIN";
  return <DeployView groups={groups} filter={filter || "all"} canApprove={canApprove} />;
}
