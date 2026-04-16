// Types and pure helpers for the deploy module. No server-only imports —
// both server and client components can import from here.

export type Channel = "fb" | "shopee" | "tiktok" | "web";

export type DeployProduct = {
  deploy_id: string;
  order_id: string;
  order_name: string | null;
  line_id: string | null;
  sku: string | null;
  product_name: string | null;
  qty: number | null;
  unit_price: number | null;
  sell_price: number | null;
  product_desc: string | null;
  info_done: boolean | null;
  status: string | null;
  created_at: string | null;
  done_at: string | null;
  price_approved_by: string | null;
  fb_done: boolean | null;  fb_done_at: string | null;  fb_links: string | null;
  shopee_done: boolean | null; shopee_done_at: string | null; shopee_links: string | null;
  tiktok_done: boolean | null; tiktok_done_at: string | null; tiktok_links: string | null;
  web_done: boolean | null;  web_done_at: string | null;  web_links: string | null;
};

export type DeployGroup = {
  order_id: string;
  order_name: string;
  order_stage: string | null;
  arrival_date: string | null;
  supplier_name: string | null;
  order_total: number | null;
  products: DeployProduct[];
};

export function parseLinks(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
  } catch {
    return raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function stringifyLinks(arr: string[]): string {
  return JSON.stringify(arr.filter(Boolean));
}
