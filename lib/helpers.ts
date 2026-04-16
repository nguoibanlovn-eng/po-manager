// Ported from gs.txt — HELPERS section. Timezone: Asia/Ho_Chi_Minh.

const TZ = "Asia/Ho_Chi_Minh";

function toTzDate(d: Date): Date {
  // Returns a date whose UTC fields reflect the given date in Asia/Ho_Chi_Minh.
  const s = d.toLocaleString("en-US", { timeZone: TZ });
  return new Date(s);
}

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

export function nowVN(): string {
  const d = toTzDate(new Date());
  return (
    d.getFullYear() +
    "-" + pad(d.getMonth() + 1) +
    "-" + pad(d.getDate()) +
    " " + pad(d.getHours()) +
    ":" + pad(d.getMinutes()) +
    ":" + pad(d.getSeconds())
  );
}

export function dateVN(d?: Date | string | null, offsetDays = 0): string {
  const dt = d ? new Date(d) : new Date();
  if (offsetDays) dt.setDate(dt.getDate() + offsetDays);
  const t = toTzDate(dt);
  return t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate());
}

export function toYmd(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return dateVN(v);
  return String(v).substring(0, 10);
}

export function monthKey(d?: Date | string | null): string {
  return dateVN(d).substring(0, 7);
}

export function uid(prefix = "ID"): string {
  return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 9000 + 1000);
}

export function bool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  return String(v || "").toUpperCase() === "TRUE";
}

export function num(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export function sanitize(v: unknown): unknown {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.getTime() > 0 ? dateVN(v) : "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number" || typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(sanitize);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) {
      out[k] = sanitize((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return String(v);
}
