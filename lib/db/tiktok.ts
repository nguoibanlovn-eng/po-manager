import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type TiktokAdsRow = {
  date: string;
  advertiser_id: string;
  advertiser_name: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  conversions: number | null;
  conversion_value: number | null;
  synced_at: string | null;
};

export type TiktokChannelRow = {
  date: string;
  account_id: string;
  username: string | null;
  followers: number | null;
  new_followers: number | null;
  video_views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};

export async function listTiktokAds(from?: string, to?: string): Promise<TiktokAdsRow[]> {
  const db = supabaseAdmin();
  let q = db.from("tiktok_ads").select("*").order("date", { ascending: false });
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  const { data } = await q.limit(2000);
  return (data as TiktokAdsRow[]) || [];
}

export async function listTiktokChannels(from?: string, to?: string): Promise<TiktokChannelRow[]> {
  const db = supabaseAdmin();
  let q = db.from("tiktok_channel").select("*").order("date", { ascending: false });
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  const { data } = await q.limit(1000);
  return (data as TiktokChannelRow[]) || [];
}
