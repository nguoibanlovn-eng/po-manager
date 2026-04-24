/**
 * Exchange TikTok auth_code → access_token (chạy local)
 *
 * Usage:
 *   npx tsx scripts/tiktok-auth.ts <auth_code>
 *
 * Sau khi chạy, copy TIKTOK_ACCESS_TOKEN vào .env.local
 */

const AUTH_CODE = process.argv[2];
if (!AUTH_CODE) {
  console.error("Usage: npx tsx scripts/tiktok-auth.ts <auth_code>");
  process.exit(1);
}

const APP_ID = "7631105631675498497";
const APP_SECRET = "e1d37bc24cfbb1fd1e1c0479ad0b9e63ace90565";

async function main() {
  console.log("Exchanging auth_code →", AUTH_CODE.substring(0, 20) + "...");

  const res = await fetch(
    "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: APP_ID,
        secret: APP_SECRET,
        auth_code: AUTH_CODE,
      }),
    }
  );

  const json = await res.json();
  console.log("\nFull response:", JSON.stringify(json, null, 2));

  if (json.code === 0 && json.data?.access_token) {
    console.log("\n✅ SUCCESS!");
    console.log("TIKTOK_ACCESS_TOKEN=" + json.data.access_token);
    console.log("Advertiser IDs:", json.data.advertiser_ids?.join(","));
  } else {
    console.error("\n❌ FAILED:", json.message);
  }
}

main();
