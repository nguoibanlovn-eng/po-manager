import { supabaseAdmin } from "@/lib/supabase/admin";
import { readSessionEmail } from "@/lib/auth/session";
import type { RoleCode } from "@/lib/auth/roles";

export type AppUser = {
  email: string;
  name: string;
  role: RoleCode;
  team: string;
  channels: string[];
  is_active: boolean;
  extra_permissions: string | null;
};

export async function getCurrentUser(): Promise<AppUser | null> {
  const email = await readSessionEmail();
  if (!email) return null;
  const { data } = await supabaseAdmin()
    .from("users")
    .select("email, name, role, team, channels, is_active, extra_permissions")
    .ilike("email", email)
    .maybeSingle();
  if (!data) return null;
  if (data.is_active === false) return null;

  const channels = String(data.channels || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    email: data.email,
    name: data.name || "",
    role: (data.role || "VIEWER").toUpperCase() as RoleCode,
    team: data.team || "",
    channels,
    is_active: data.is_active !== false,
    extra_permissions: data.extra_permissions || null,
  };
}

export async function requireUser(): Promise<AppUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}
