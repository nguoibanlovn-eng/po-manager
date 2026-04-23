import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/user";

export default async function AppHome() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");

  // KD staff → channel dashboard. Others → admin dashboard.
  if (["NV_KD", "LEADER_KD"].includes(u.role) && u.channels?.length > 0) {
    redirect("/sales-dash");
  }
  redirect("/dash");
}
