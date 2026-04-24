import "server-only";

const BASE = "https://api.ssc.eco";

let cachedToken: string | null = null;
let tokenExpiry = 0;

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env ${key}`);
  return v;
}

export async function sscGetToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(`${BASE}/auth/get-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: env("SSC_EMAIL"),
      password: env("SSC_PASSWORD"),
    }),
  });
  const json = await res.json();
  if (!json.success || !json.token) {
    throw new Error(`SSC auth failed: ${json.message || res.status}`);
  }
  cachedToken = json.token;
  tokenExpiry = Date.now() + 3600_000; // cache 1h
  return json.token;
}

export type SscAvailable = {
  name: string;
  customer_goods_barcode: string;
  sku: number;
  available: number;
};

export async function sscGetAvailable(
  barcode: string,
  token: string,
): Promise<SscAvailable | null> {
  const res = await fetch(
    `${BASE}/frontend/goods/get-available?barcode=${encodeURIComponent(barcode)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const json = await res.json();
  if (!json.success) return null; // goods_not_found
  return json as SscAvailable;
}

/** Batch query SSC inventory — 10 concurrent requests */
export async function sscGetAvailableBatch(
  barcodes: string[],
  token: string,
  concurrency = 10,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  let errors = 0;
  let notFound = 0;
  for (let i = 0; i < barcodes.length; i += concurrency) {
    const batch = barcodes.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((bc) => sscGetAvailable(bc, token)),
    );
    for (let j = 0; j < batch.length; j++) {
      const s = settled[j];
      if (s.status === "fulfilled" && s.value) {
        result.set(batch[j], s.value.available);
      } else if (s.status === "rejected") {
        errors++;
      } else {
        notFound++;
      }
    }
    // Log progress every 500 barcodes
    if ((i + concurrency) % 500 === 0 || i + concurrency >= barcodes.length) {
      console.log(`[SSC batch] ${Math.min(i + concurrency, barcodes.length)}/${barcodes.length} — found=${result.size} notFound=${notFound} errors=${errors}`);
    }
  }
  console.log(`[SSC batch] Done: ${result.size} found, ${notFound} not found, ${errors} errors out of ${barcodes.length}`);
  return result;
}
