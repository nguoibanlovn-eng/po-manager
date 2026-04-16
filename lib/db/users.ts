import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type UserRef = { email: string; name: string | null; role: string | null };

export async function listActiveUsers(): Promise<UserRef[]> {
  const { data } = await supabaseAdmin()
    .from("users")
    .select("email, name, role")
    .eq("is_active", true)
    .order("name", { ascending: true });
  return (data as UserRef[]) || [];
}
