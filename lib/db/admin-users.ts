import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { nowVN } from "@/lib/helpers";

export type AdminUserRow = {
  email: string;
  name: string | null;
  role: string | null;
  team: string | null;
  channels: string | null;
  is_active: boolean | null;
  extra_permissions: string | null;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string | null;
  note: string | null;
};

export async function listAllUsers(): Promise<AdminUserRow[]> {
  const { data } = await supabaseAdmin()
    .from("users").select("*")
    .order("is_active", { ascending: false })
    .order("role", { ascending: true });
  return (data as AdminUserRow[]) || [];
}

export async function saveUser(user: Partial<AdminUserRow>): Promise<string> {
  if (!user.email) throw new Error("Thiếu email");
  const email = user.email.trim().toLowerCase();
  const { error } = await supabaseAdmin()
    .from("users")
    .upsert(
      {
        email,
        name: user.name || null,
        role: user.role || "VIEWER",
        team: user.team || null,
        channels: user.channels || null,
        is_active: user.is_active !== false,
        note: user.note || null,
        created_at: user.created_at || nowVN(),
      },
      { onConflict: "email" },
    );
  if (error) throw error;
  return email;
}

export async function toggleLockUser(email: string, lock: boolean, by: string) {
  const patch = lock
    ? { is_active: false, locked_at: nowVN(), locked_by: by }
    : { is_active: true, locked_at: null, locked_by: null };
  await supabaseAdmin().from("users").update(patch).eq("email", email);
}

export async function deleteUser(email: string) {
  await supabaseAdmin().from("users").delete().eq("email", email);
}
