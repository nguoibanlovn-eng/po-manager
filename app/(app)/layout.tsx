import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/user";
import Shell from "./Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <Shell user={user}>{children}</Shell>;
}
