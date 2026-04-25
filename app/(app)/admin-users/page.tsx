import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/user";
import { listAllUsers } from "@/lib/db/admin-users";
import { listEvaluations, getTaskStats, getOverdueTasks } from "@/lib/db/hr";
import HrView from "./HrView";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") redirect("/");

  const currentPeriod = new Date().toISOString().substring(0, 7); // "2026-04"
  const monthStart = currentPeriod + "-01";
  const monthEnd = currentPeriod + "-31";

  const [users, evaluations, taskStats, overdueTasks] = await Promise.all([
    listAllUsers(),
    listEvaluations(currentPeriod),
    getTaskStats(monthStart, monthEnd),
    getOverdueTasks(10),
  ]);

  return (
    <HrView
      users={users}
      evaluations={evaluations}
      taskStats={taskStats}
      overdueTasks={overdueTasks}
      currentPeriod={currentPeriod}
      currentUserEmail={u.email}
    />
  );
}
