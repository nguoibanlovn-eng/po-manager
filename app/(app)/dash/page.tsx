import Link from "next/link";
import { getDashboardStats, getRecentOrders, getRevenueByChannel, getYearlySummary } from "@/lib/db/dashboard";
import { getChannelTarget } from "@/lib/db/tiktok";
import { getCurrentUser } from "@/lib/auth/user";
import { dateVN } from "@/lib/helpers";
import { formatDate, formatVND, formatVNDCompact } from "@/lib/format";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  DRAFT: "Nháp", ORDERED: "Đã đặt", ARRIVED: "Hàng về",
  QC_DONE: "QC xong", ON_SHELF: "Lên kệ", SELLING: "Đang bán", COMPLETED: "Hoàn tất",
};

const CHANNEL_COLORS: Record<string, string> = {
  Facebook: "#1877F2", TikTok: "#FE2C55", Shopee: "#EE4D2D",
  Website: "#6366F1", App: "#8B5CF6", "Nội bộ": "#9CA3AF",
};

export default async function DashPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view || "month";
  const month = sp.month || dateVN().substring(0, 7);
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;

  // Last 7 days for chart
  const d7from = dateVN(null, -7);
  const d7to = dateVN();

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const currentYear = Number(month.split("-")[0]);

  const [user, stats, recent, revMonth, rev7d, fbTarget, tkTarget, spTarget, yearly] = await Promise.all([
    getCurrentUser(),
    getDashboardStats(month),
    getRecentOrders(10),
    getRevenueByChannel(from, to),
    getRevenueByChannel(d7from, d7to),
    getChannelTarget("facebook", monthKey),
    getChannelTarget("tiktok", monthKey),
    getChannelTarget("shopee", monthKey),
    getYearlySummary(currentYear),
  ]);

  const totalAdSpend = stats.revenue.adSpend + stats.revenue.shopeeAdSpend + stats.revenue.tiktokAdSpend;
  const overallRoas = totalAdSpend > 0 ? revMonth.total / totalAdSpend : 0;
  const adsPct = revMonth.total > 0 ? (totalAdSpend / revMonth.total) * 100 : 0;

  // 7-day chart data
  const max7d = Math.max(...rev7d.daily.map((d) => d.revenue), 1);
  const avg7d = rev7d.daily.length > 0 ? rev7d.total / rev7d.daily.length : 0;
  const best7d = rev7d.daily.reduce((best, d) => d.revenue > best.revenue ? d : best, { date: "", revenue: 0 });

  // Year summary
  const yearPct = yearly.yearTarget > 0 ? Math.round((yearly.cumRevenue / yearly.yearTarget) * 100) : 0;
  const yearRemaining = Math.max(0, yearly.yearTarget - yearly.cumRevenue);
  const yearAdsPct = yearly.cumRevenue > 0 ? (yearly.cumAds / yearly.cumRevenue) * 100 : 0;

  // ═══════════════════════════════════════════════════════
  // YEARLY VIEW
  // ═══════════════════════════════════════════════════════
  if (view === "year") {
    const maxMonthRev = Math.max(...yearly.months.map((m) => m.revenue), 1);
    const maxMonthTarget = Math.max(...yearly.months.map((m) => m.target), 1);
    const maxBar = Math.max(maxMonthRev, maxMonthTarget);
    const nowMonth = now.getMonth() + 1; // 1-based

    return (
      <section className="section">
        <div className="page-hdr">
          <div>
            <div className="page-title">Dashboard</div>
            <div className="page-sub">Năm {currentYear} · KH: {formatVNDCompact(yearly.yearTarget)}</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Link href="/dash?view=month" className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>Tháng</Link>
            <Link href="/dash?view=year" className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>Năm</Link>
          </div>
        </div>

        {/* Year KPIs */}
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
          <div className="stat-card" style={{ borderLeft: "4px solid #16A34A" }}>
            <div className="sl">DOANH THU LŨY KẾ</div>
            <div className="sv" style={{ color: "#16A34A" }}>{formatVNDCompact(yearly.cumRevenue)}</div>
            <div className="ss">T1-T{Math.min(nowMonth, 12)}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: "4px solid #3B82F6" }}>
            <div className="sl">KẾ HOẠCH NĂM</div>
            <div className="sv">{formatVNDCompact(yearly.yearTarget)}</div>
            <div className="ss">{yearPct}% đạt</div>
          </div>
          <div className="stat-card" style={{ borderLeft: "4px solid #DC2626" }}>
            <div className="sl">CÒN PHẢI ĐẠT</div>
            <div className="sv" style={{ color: "#DC2626" }}>{formatVNDCompact(yearRemaining)}</div>
            <div className="ss">{100 - yearPct}% còn lại</div>
          </div>
          <div className="stat-card" style={{ borderLeft: "4px solid #D97706" }}>
            <div className="sl">CHI PHÍ ADS LŨY KẾ</div>
            <div className="sv">{formatVNDCompact(yearly.cumAds)}</div>
            <div className="ss">Ads/DT: {yearAdsPct.toFixed(1)}%</div>
          </div>
          <div className="stat-card" style={{ borderLeft: "4px solid #7C3AED" }}>
            <div className="sl">ROAS NĂM</div>
            <div className="sv">{yearly.cumAds > 0 ? (yearly.cumRevenue / yearly.cumAds).toFixed(1) : "—"}x</div>
            <div className="ss">DT / Ads</div>
          </div>
        </div>

        {/* Year progress bar */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6, padding: "8px 14px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
            <span>Đã đạt <strong style={{ color: "#16A34A" }}>{formatVNDCompact(yearly.cumRevenue)}</strong> ({yearPct}%)</span>
            <span>KH {currentYear}: <strong>{formatVNDCompact(yearly.yearTarget)}</strong></span>
            <span>Còn: <strong style={{ color: "#DC2626" }}>{formatVNDCompact(yearRemaining)}</strong></span>
          </div>
          <div style={{ height: 18, background: "#F3F4F6", borderRadius: 4, overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(yearPct, 100)}%`, background: yearPct >= 100 ? "#16A34A" : "#3B82F6", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>{yearPct}%</span>
            </div>
            <div style={{ position: "absolute", top: 0, left: `${Math.round((nowMonth / 12) * 100)}%`, width: 1.5, height: "100%", background: "#000", opacity: 0.3 }} />
          </div>
        </div>

        {/* Monthly bar chart T1-T12 */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Doanh thu theo tháng</div>
          <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#6B7280", marginBottom: 8 }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#4ADE80", marginRight: 3, verticalAlign: "middle" }} />Thực tế</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#E5E7EB", marginRight: 3, verticalAlign: "middle" }} />Kế hoạch</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", height: 140 }}>
            {yearly.months.map((m, i) => {
              const revH = maxBar > 0 ? (m.revenue / maxBar) * 110 : 0;
              const tgtH = maxBar > 0 ? (m.target / maxBar) * 110 : 0;
              const isPast = i + 1 <= nowMonth;
              return (
                <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                  {m.revenue > 0 && <div style={{ fontSize: 7, fontWeight: 600, color: "#16A34A", marginBottom: 1 }}>{formatVNDCompact(m.revenue)}</div>}
                  <div style={{ width: "80%", position: "relative" }}>
                    {/* Target ghost bar */}
                    <div style={{ width: "100%", height: Math.max(tgtH, 1), background: "#E5E7EB", borderRadius: "2px 2px 0 0", position: "absolute", bottom: 0 }} />
                    {/* Actual bar */}
                    <div style={{ width: "100%", height: Math.max(revH, isPast && m.revenue > 0 ? 2 : 0), background: isPast ? "#4ADE80" : "transparent", borderRadius: "2px 2px 0 0", position: "relative", zIndex: 1 }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", borderTop: "1px solid #E5E7EB" }}>
            {yearly.months.map((m, i) => (
              <div key={`l-${m.month}`} style={{ flex: 1, textAlign: "center", fontSize: 9, fontWeight: i + 1 === nowMonth ? 700 : 400, color: i + 1 === nowMonth ? "#3B82F6" : "#999", padding: "3px 0" }}>
                T{i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Monthly detail table */}
        <div className="card" style={{ marginBottom: 12, padding: 0 }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 12 }}>
            Doanh thu + Ads lũy kế theo tháng
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th>Tháng</th><th className="text-right">KH</th><th className="text-right">Thực tế</th>
                <th className="text-right">%</th><th className="text-right">Ads</th><th className="text-right">Ads/DT</th>
                <th className="text-right">Lũy kế DT</th><th className="text-right">Lũy kế Ads</th>
              </tr></thead>
              <tbody>
                {(() => {
                  let cumRev = 0, cumAd = 0;
                  return yearly.months.map((m, i) => {
                    cumRev += m.revenue; cumAd += m.ads;
                    const pct = m.target > 0 ? Math.round((m.revenue / m.target) * 100) : 0;
                    const adRatio = m.revenue > 0 ? ((m.ads / m.revenue) * 100).toFixed(1) : "—";
                    const hasData = m.revenue > 0 || m.ads > 0;
                    return (
                      <tr key={m.month} style={{ color: hasData ? undefined : "#D1D5DB" }}>
                        <td style={{ fontWeight: 600 }}>T{i + 1}</td>
                        <td className="text-right">{formatVNDCompact(m.target)}</td>
                        <td className="text-right" style={{ color: hasData ? "#16A34A" : undefined, fontWeight: 600 }}>{hasData ? formatVNDCompact(m.revenue) : "—"}</td>
                        <td className="text-right" style={{ fontWeight: 700, color: pct >= 100 ? "#16A34A" : pct > 0 ? "#D97706" : undefined }}>{pct > 0 ? `${pct}%` : "—"}</td>
                        <td className="text-right" style={{ color: "#DC2626" }}>{m.ads > 0 ? formatVNDCompact(m.ads) : "—"}</td>
                        <td className="text-right">{adRatio}%</td>
                        <td className="text-right" style={{ fontWeight: 600 }}>{cumRev > 0 ? formatVNDCompact(cumRev) : "—"}</td>
                        <td className="text-right" style={{ color: "#DC2626" }}>{cumAd > 0 ? formatVNDCompact(cumAd) : "—"}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Monthly progress bars */}
        <div className="card" style={{ marginBottom: 12, padding: "12px 14px" }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Tiến độ từng tháng</div>
          {yearly.months.filter((m) => m.target > 0).map((m, i) => {
            const pct = m.target > 0 ? Math.round((m.revenue / m.target) * 100) : 0;
            const color = pct >= 100 ? "#16A34A" : pct > 0 ? "#3B82F6" : "#E5E7EB";
            return (
              <div key={m.month} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, width: 24, color: i + 1 === nowMonth ? "#3B82F6" : "#6B7280" }}>T{i + 1}</span>
                <div style={{ flex: 1, height: 10, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 9, fontWeight: 600, width: 32, textAlign: "right", color: pct >= 100 ? "#16A34A" : pct > 0 ? "#374151" : "#D1D5DB" }}>{pct > 0 ? `${pct}%` : "—"}</span>
                <span style={{ fontSize: 9, width: 45, textAlign: "right", color: "#6B7280" }}>{m.revenue > 0 ? formatVNDCompact(m.revenue) : "—"}</span>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  // ═══════════════════════════════════════════════════════
  // MONTHLY VIEW (default)
  // ═══════════════════════════════════════════════════════

  return (
    <section className="section" id="tab-dash">
      <div className="page-hdr">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">
            Xin chào <b>{user?.name || user?.email}</b> · Tháng {month}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Link href="/dash?view=month" className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>Tháng</Link>
          <Link href="/dash?view=year" className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>Năm</Link>
          <form style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input id="dash-month" type="month" name="month" defaultValue={month} style={{ fontSize: 12 }} />
            <button type="submit" className="btn btn-ghost btn-sm">Áp dụng</button>
          </form>
        </div>
      </div>

      {/* ═══ ROW 1: Top KPIs ═══ */}
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        <div className="stat-card" style={{ borderLeft: "4px solid #16A34A" }}>
          <div className="sl">DOANH THU THÁNG</div>
          <div className="sv" style={{ color: "#16A34A" }}>{formatVNDCompact(revMonth.total)}</div>
          <div className="ss">nhanh.vn · {revMonth.totalOrders.toLocaleString("vi-VN")} đơn</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #DC2626" }}>
          <div className="sl">CHI PHÍ ADS</div>
          <div className="sv" style={{ color: "#DC2626" }}>{formatVNDCompact(totalAdSpend)}</div>
          <div className="ss">FB + Shopee + TikTok</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #3B82F6" }}>
          <div className="sl">ADS / DOANH THU</div>
          <div className="sv">{adsPct.toFixed(1)}%</div>
          <div className="ss">ROAS {overallRoas.toFixed(1)}x</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #7C3AED" }}>
          <div className="sl">CÔNG NỢ</div>
          <div className="sv" style={{ color: stats.finance.outstanding > 0 ? "#DC2626" : "#16A34A" }}>{formatVNDCompact(stats.finance.outstanding)}</div>
          <div className="ss">TT {formatVNDCompact(stats.finance.totalDeposited)}</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #D97706" }}>
          <div className="sl">THIỆT HẠI</div>
          <div className="sv" style={{ color: stats.damage.pendingItems > 0 ? "#DC2626" : "#16A34A" }}>{stats.damage.pendingItems > 0 ? formatVNDCompact(stats.damage.pendingValue) : "0"}</div>
          <div className="ss">{stats.damage.pendingItems} SP chờ xử lý</div>
        </div>
      </div>

      {/* ═══ ROW 2: Channel revenue + Ads breakdown + 7-day chart ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        {/* Channel revenue stacked */}
        <div className="card" style={{ padding: "12px 14px" }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Doanh thu theo kênh</div>
          {revMonth.channels.map((ch) => {
            const pct = revMonth.total > 0 ? (ch.revenue / revMonth.total) * 100 : 0;
            const color = CHANNEL_COLORS[ch.name] || "#6B7280";
            return (
              <div key={ch.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, flex: 1 }}>{ch.name}</span>
                <div style={{ width: 80, height: 8, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, width: 50, textAlign: "right" }}>{formatVNDCompact(ch.revenue)}</span>
                <span style={{ fontSize: 9, color: "#9CA3AF", width: 28, textAlign: "right" }}>{pct.toFixed(0)}%</span>
              </div>
            );
          })}
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700 }}>
            <span>Tổng</span>
            <span style={{ color: "#16A34A" }}>{formatVNDCompact(revMonth.total)}</span>
          </div>
        </div>

        {/* Ads breakdown */}
        <div className="card" style={{ padding: "12px 14px" }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Chi phí Ads theo kênh</div>
          {[
            { name: "Facebook", spend: stats.revenue.adSpend, color: "#1877F2" },
            { name: "Shopee", spend: stats.revenue.shopeeAdSpend, color: "#EE4D2D" },
            { name: "TikTok", spend: stats.revenue.tiktokAdSpend, color: "#FE2C55" },
          ].map((ch) => {
            const pct = totalAdSpend > 0 ? (ch.spend / totalAdSpend) * 100 : 0;
            return (
              <div key={ch.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: ch.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, flex: 1 }}>{ch.name}</span>
                <div style={{ width: 80, height: 8, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: ch.color, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, width: 50, textAlign: "right", color: "#DC2626" }}>{formatVNDCompact(ch.spend)}</span>
                <span style={{ fontSize: 9, color: "#9CA3AF", width: 28, textAlign: "right" }}>{pct.toFixed(0)}%</span>
              </div>
            );
          })}
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700 }}>
            <span>Tổng</span>
            <span style={{ color: "#DC2626" }}>{formatVNDCompact(totalAdSpend)}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: "#6B7280" }}>
            Tỉ lệ Ads/DT: <strong style={{ color: adsPct > 10 ? "#DC2626" : "#16A34A" }}>{adsPct.toFixed(1)}%</strong> · ROAS: <strong style={{ color: overallRoas >= 10 ? "#16A34A" : "#DC2626" }}>{overallRoas.toFixed(1)}x</strong>
          </div>
        </div>

        {/* 7-day revenue chart */}
        <div className="card" style={{ padding: "12px 14px" }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Doanh thu 7 ngày</div>
          <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 8 }}>
            Cao nhất <strong style={{ color: "#16A34A" }}>{formatVNDCompact(best7d.revenue)}</strong> {best7d.date.substring(5)} · TB <strong>{formatVNDCompact(avg7d)}</strong>/ngày
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", height: 80, gap: 0 }}>
            {rev7d.daily.map((d) => {
              const h = (d.revenue / max7d) * 60;
              return (
                <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                  <div style={{ width: "80%", height: Math.max(h, 2), background: "#4ADE80", borderRadius: 2 }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex" }}>
            {rev7d.daily.map((d) => (
              <div key={`l-${d.date}`} style={{ flex: 1, textAlign: "center", fontSize: 8, color: "#999", paddingTop: 2 }}>
                {d.date.substring(8)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ ROW 3: Channel targets ═══ */}
      <div className="card" style={{ marginBottom: 12, padding: "12px 14px" }}>
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Mục tiêu theo kênh (tháng {month.substring(5)})</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { name: "Facebook", target: fbTarget, actual: revMonth.channels.find((c) => c.name === "Facebook")?.revenue || 0, color: "#1877F2" },
            { name: "TikTok", target: tkTarget, actual: revMonth.channels.find((c) => c.name === "TikTok")?.revenue || 0, color: "#FE2C55" },
            { name: "Shopee", target: spTarget, actual: revMonth.channels.find((c) => c.name === "Shopee")?.revenue || 0, color: "#EE4D2D" },
          ].map((ch) => {
            const pct = ch.target > 0 ? Math.round((ch.actual / ch.target) * 100) : 0;
            const dayPct = Math.round((now.getDate() / lastDay) * 100);
            const ahead = pct >= dayPct;
            return (
              <div key={ch.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, width: 60 }}>{ch.name}</span>
                <div style={{ flex: 1, height: 12, background: "#F3F4F6", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(pct, 100)}%`, background: ch.color, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {pct > 15 && <span style={{ fontSize: 8, fontWeight: 700, color: "#fff" }}>{pct}%</span>}
                  </div>
                  <div style={{ position: "absolute", top: 0, left: `${dayPct}%`, width: 1, height: "100%", background: "#000", opacity: 0.3 }} />
                </div>
                <span style={{ fontSize: 9, fontWeight: 600, color: ahead ? "#16A34A" : "#DC2626", width: 40, textAlign: "right" }}>{formatVNDCompact(ch.actual)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ ROW 4: Pipeline + Inventory + Sức khoẻ ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        {/* Pipeline */}
        <div className="card" style={{ padding: "12px 14px" }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Pipeline đơn hàng</div>
          {(["DRAFT", "ARRIVED", "ON_SHELF"] as const).map((stage) => {
            const count = stats.orders[stage.toLowerCase() as keyof typeof stats.orders] as number || 0;
            const pct = stats.orders.total > 0 ? (count / stats.orders.total) * 100 : 0;
            const colors: Record<string, string> = { DRAFT: "#6B7280", ARRIVED: "#D97706", ON_SHELF: "#16A34A" };
            return (
              <div key={stage} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span className={`stage-badge stage-${stage}`} style={{ fontSize: 10, minWidth: 60 }}>{STAGE_LABEL[stage]}</span>
                <div style={{ flex: 1, height: 8, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: colors[stage] || "#3B82F6", borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, minWidth: 24, textAlign: "right" }}>{count}</span>
              </div>
            );
          })}
          <Link href="/list" style={{ fontSize: 10, color: "var(--blue)" }}>Xem tất cả →</Link>
        </div>

        {/* Inventory */}
        <div className="card" style={{ padding: "12px 14px" }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Tồn kho</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span>Tổng SKU</span><span style={{ fontWeight: 700 }}>{stats.inventory.totalSkus.toLocaleString("vi-VN")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#DC2626" }}>
              <span>Hết hàng</span><span style={{ fontWeight: 700 }}>{stats.inventory.outOfStock.toLocaleString("vi-VN")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#D97706" }}>
              <span>Sắp hết (≤5)</span><span style={{ fontWeight: 700 }}>{stats.inventory.lowStock.toLocaleString("vi-VN")}</span>
            </div>
          </div>
          <Link href="/inventory" style={{ fontSize: 10, color: "var(--blue)", marginTop: 6, display: "block" }}>Chi tiết →</Link>
        </div>

        {/* Sức khoẻ vận hành */}
        <div className="card" style={{ padding: "12px 14px" }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Sức khoẻ vận hành</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Thanh toán NCC</span>
              <span style={{ fontWeight: 700, color: stats.finance.outstanding > 0 ? "#DC2626" : "#16A34A" }}>
                {stats.finance.totalDeposited > 0 ? Math.round((stats.finance.totalDeposited / stats.finance.totalOrderValue) * 100) : 0}% đã TT
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Hàng hỏng</span>
              <span style={{ fontWeight: 700, color: stats.damage.pendingItems > 0 ? "#DC2626" : "#16A34A" }}>
                {stats.damage.pendingItems > 0 ? `${stats.damage.pendingItems} chờ` : "OK"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Hết hàng</span>
              <span style={{ fontWeight: 700, color: stats.inventory.outOfStock > 0 ? "#DC2626" : "#16A34A" }}>
                {stats.inventory.outOfStock > 0 ? stats.inventory.outOfStock : "OK"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ ROW 5: Recent orders ═══ */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
          <span>Đơn gần nhất</span>
          <Link href="/list" style={{ fontSize: 10, color: "var(--blue)" }}>Tất cả →</Link>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>Mã đơn</th><th>Tên</th><th>NCC</th><th>Owner</th><th>Giai đoạn</th><th className="text-right">Giá trị</th><th>Ngày tạo</th>
            </tr></thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.order_id}>
                  <td style={{ fontWeight: 700 }}><Link href={`/create?order_id=${o.order_id}`} style={{ color: "var(--blue)" }}>{o.order_id}</Link></td>
                  <td>{o.order_name || "—"}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{o.supplier_name || "—"}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{o.owner || "—"}</td>
                  <td><span className={`stage-badge stage-${o.stage}`}>{STAGE_LABEL[String(o.stage || "DRAFT")]}</span></td>
                  <td className="text-right font-bold">{formatVND(o.order_total)}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{formatDate(o.created_at)}</td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>Chưa có đơn nào.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
