import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

const COOKIE_NAME = "po_session";
const SESSION_TTL_DAYS = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(
  email: string,
  userAgent?: string | null,
  ip?: string | null,
): Promise<string> {
  const token = newSessionToken();
  const tokenHash = hashToken(token);
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000);

  const { error } = await supabaseAdmin()
    .from("user_sessions")
    .insert({
      token_hash: tokenHash,
      email,
      expires_at: expires.toISOString(),
      user_agent: userAgent ?? null,
      ip: ip ?? null,
    });
  if (error) throw new Error("createSession: " + error.message);

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await supabaseAdmin()
      .from("user_sessions")
      .delete()
      .eq("token_hash", hashToken(token));
  }
  jar.delete(COOKIE_NAME);
}

export async function readSessionEmail(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const { data } = await supabaseAdmin()
    .from("user_sessions")
    .select("email, expires_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  return data.email;
}

export async function readSessionFromRequestCookie(
  tokenCookieValue: string | undefined,
): Promise<string | null> {
  if (!tokenCookieValue) return null;
  const { data } = await supabaseAdmin()
    .from("user_sessions")
    .select("email, expires_at")
    .eq("token_hash", hashToken(tokenCookieValue))
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  return data.email;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
