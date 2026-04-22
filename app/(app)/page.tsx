import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/user";

export default async function AppHome() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");

  // Mirrors gs.txt default-tab-by-role logic.
  switch (u.role) {
    case "ADMIN":
      redirect("/dash");
    case "LEADER_MH":
    case "NV_MH":
      redirect("/create");
    case "LEADER_KT":
    case "NV_KT":
      redirect("/tech");
    case "LEADER_KD":
      redirect("/sales-leader");
    case "NV_KD":
      redirect("/deploy");
    case "LEADER_KETOAN":
    case "NV_KETOAN":
      redirect("/finance");
    default:
      redirect("/dash");
  }
}
