import { listTasks } from "@/lib/db/tasks";
import { listActiveUsers } from "@/lib/db/users";
import { getCurrentUser } from "@/lib/auth/user";
import TasksView from "./TasksView";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "all" } = await searchParams;
  const user = await getCurrentUser();
  const filterVal = (filter === "mine" || filter === "assigned_by_me" ? filter : "all") as
    | "all" | "mine" | "assigned_by_me";
  const [tasks, users] = await Promise.all([
    listTasks(filterVal, user?.email),
    listActiveUsers(),
  ]);
  return (
    <TasksView
      tasks={tasks}
      users={users}
      filter={filterVal}
      currentUser={user ? { email: user.email, name: user.name } : null}
    />
  );
}
