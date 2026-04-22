import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/user";

export default async function AppHome() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");

  // All roles → dashboard first. Other pages accessible via menu.
  redirect("/dash");
}
