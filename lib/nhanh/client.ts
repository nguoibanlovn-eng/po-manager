import "server-only";

// ─── v2 API — POST form-urlencoded with JSON 'data' field ────
const V2_BASE = "https://pos.open.nhanh.vn/api";
const V3_BASE = "https://pos.open.nhanh.vn/v3.0";

export type NhanhResponse<T = unknown> = {
  code: number;
  messages?: unknown;
  data?: T;
  paginator?: { page?: number; size?: number; next?: unknown; totalPages?: number };
};

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env ${key}`);
  return v;
}

export async function nhanhReq<T = unknown>(
  endpoint: string,
  body: Record<string, unknown> = {},
): Promise<NhanhResponse<T>> {
  const url = V2_BASE + endpoint;
  const params = new URLSearchParams({
    version: "2.0",
    appId: env("NHANH_APP_ID"),
    businessId: env("NHANH_BUSINESS_ID"),
    accessToken: env("NHANH_TOKEN"),
    data: JSON.stringify(body),
  });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as NhanhResponse<T>;
    } catch {
      return { code: 0, messages: "Parse error: " + text.substring(0, 200) };
    }
  } catch (e) {
    return { code: 0, messages: (e as Error).message };
  }
}

// Paginate v2 endpoints — returns flat array of items across all pages.
export async function nhanhFetchAll<T = unknown>(
  endpoint: string,
  body: Record<string, unknown> = {},
  maxPages = 50,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const b = JSON.parse(JSON.stringify(body));
    b.paginator = b.paginator || {};
    b.paginator.size = b.paginator.size || 200;
    b.paginator.page = page;
    const r = await nhanhReq<Record<string, T> | T[]>(endpoint, b);
    if (!r || r.code !== 1 || !r.data) {
      console.log(`[nhanhFetchAll] ${endpoint} page ${page}: code=${r?.code}, hasData=${!!r?.data}`);
      break;
    }
    let chunk: T[];
    const d = r.data as Record<string, unknown>;
    if (d.orders && typeof d.orders === "object") {
      chunk = Object.values(d.orders as Record<string, T>);
    } else if (Array.isArray(r.data)) {
      chunk = r.data as T[];
    } else {
      chunk = Object.values(r.data as Record<string, T>);
    }
    const totalPages = Number(d.totalPages) || r.paginator?.totalPages || 1;
    const totalRecords = Number(d.totalRecords) || 0;
    console.log(`[nhanhFetchAll] ${endpoint} page ${page}/${totalPages}: chunk=${chunk.length}, total=${all.length + chunk.length}, totalRecords=${totalRecords}`);
    all.push(...chunk);
    if (page >= totalPages) break;
  }
  return all;
}

// ─── v3 API — POST JSON with Authorization header ────────────
export async function nhanhV3<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<NhanhResponse<T>> {
  const url =
    V3_BASE + "/" + path +
    "?appId=" + env("NHANH_V3_APP_ID") +
    "&businessId=" + env("NHANH_BUSINESS_ID");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: env("NHANH_V3_TOKEN"),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as NhanhResponse<T>;
    } catch {
      return { code: 0, messages: "Parse error: " + text.substring(0, 200) };
    }
  } catch (e) {
    return { code: 0, messages: (e as Error).message };
  }
}

// Paginate v3 cursor-based endpoints.
// Note: Nhanh v3 caps page size at 100 items (ignores `size` param), so even
// for 10k products we need up to 100 pages. Default maxPages bumped to 200.
export async function nhanhV3FetchAll<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
  opts: { maxPages?: number; onPage?: (chunk: T[], page: number) => void } = {},
): Promise<T[]> {
  const { maxPages = 200, onPage } = opts;
  const all: T[] = [];
  let cursor: unknown = null;
  for (let page = 1; page <= maxPages; page++) {
    const b = JSON.parse(JSON.stringify(body));
    b.paginator = cursor ? { size: 200, next: cursor } : { size: 200 };
    const r = await nhanhV3<T[]>(path, b);
    if (r.code !== 1) {
      console.warn(`[nhanhV3FetchAll] ${path} page ${page} code=${r.code}`, r.messages);
      break;
    }
    // data có thể là Array hoặc Object {id: {...}, id2: {...}}
    let chunk: T[];
    if (Array.isArray(r.data)) chunk = r.data;
    else if (r.data && typeof r.data === "object") chunk = Object.values(r.data) as T[];
    else chunk = [];
    all.push(...chunk);
    if (onPage) onPage(chunk, page);
    cursor = r.paginator?.next ?? null;
    if (!cursor) break;
    await new Promise((res) => setTimeout(res, 100));
  }
  return all;
}
