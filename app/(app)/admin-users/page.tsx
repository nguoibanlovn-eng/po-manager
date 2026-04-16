import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/user";
import { listAllUsers } from "@/lib/db/admin-users";
import AdminUsersView from "./AdminUsersView";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") redirect("/");
  const users = await listAllUsers();
  return <AdminUsersView users={users} />;
}
