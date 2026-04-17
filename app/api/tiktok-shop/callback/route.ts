import { exchangeCode } from "@/lib/tiktok/shop-api";

// TikTok Shop redirects here after shop owner authorizes
// NO auth required — this is a public callback endpoint
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || url.searchParams.get("auth_code");
  const allParams = Object.fromEntries(url.searchParams.entries());

  if (!code) {
    return Response.json({ step: "1_receive_callback", error: "no code param", received: allParams });
  }

  try {
    const result = await exchangeCode(code);
    return Response.json({ step: "2_exchange_done", ...result, code_preview: code.substring(0, 20) + "..." });
  } catch (e) {
    return Response.json({ step: "2_exchange_error", error: (e as Error).message, code_preview: code.substring(0, 20) + "..." });
  }
}
