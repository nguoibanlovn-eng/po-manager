export function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function formatVND(v: unknown): string {
  const n = toNum(v);
  return n.toLocaleString("vi-VN") + "₫";
}

export function formatVNDCompact(v: unknown): string {
  const n = Math.abs(toNum(v));
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "T";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return Math.round(n / 1_000) + "K";
  return String(n);
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

export function formatYmd(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function daysFromNow(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((dt.getTime() - today.getTime()) / 86_400_000);
}

export function payClass(status: string | null | undefined): string {
  const s = String(status || "").toLowerCase();
  if (s.includes("đã thanh toán")) return "pay-paid";
  if (s.includes("đã cọc")) return "pay-deposit";
  if (s.includes("công nợ")) return "pay-debt";
  return "pay-unpaid";
}
