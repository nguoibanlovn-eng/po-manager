import Link from "next/link";
import { getDashboardStats, getRecentOrders } from "@/lib/db/dashboard";
import { getCurrentUser } from "@/lib/auth/user";
import { dateVN } from "@/lib/helpers";
import { formatDate, formatVND } from "@/lib/format";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  DRAFT: "Nháp", ORDERED: "Đã đặt", ARRIVED: "Hàng về",
  QC_DONE: "QC xong", ON_SHELF: "Lên kệ", SELLING: "Đang bán", COMPLETED: "Hoàn tất",
};

export default async function DashPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const month = monthParam || dateVN().substring(0, 7);
  const [user, stats, recent] = await Promise.all([
    getCurrentUser(),
    getDashboardStats(month),
    getRecentOrders(10),
  ]);

  const totalRevenue =
    stats.revenue.fromAds + stats.revenue.shopeeRevenue + stats.revenue.salesSyncRevenue + stats.revenue.tiktokRevenue;
  const totalAdSpend =
    stats.revenue.adSpend + stats.revenue.shopeeAdSpend + stats.revenue.tiktokAdSpend;
  const overallRoas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;

  return (
    <section className="section" id="tab-dash">
      <div className="page-hdr">
        <div>
          <div className="page-title">📊 Dashboard</div>
          <div className="page-sub">Xin chào <b>{user?.name || user?.email}</b> · Tháng {month}</div>
        </div>
        <form style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input id="dash-month" type="month" name="month" defaultValue={month} />
          <button type="submit" className="btn btn-primary btn-sm">Áp dụng</button>
        </form>
      </div>

      {/* Row 1: Revenue + Ads KPIs */}
      <div className="stat-grid" id="dash-stats">
        <div className="stat-card c-green">
          <div className="sl">Tổng doanh thu tháng</div>
          <div className="sv">{formatVND(totalRevenue)}</div>
          <div className="ss">Web + Shopee + TikTok + Ads</div>
        </div>
        <div className="stat-card c-blue">
          <div className="sl">Chi quảng cáo</div>
          <div className="sv">{formatVND(totalAdSpend)}</div>
          <div className="ss">FB + Shopee + TikTok</div>
        </div>
        <div className="stat-card c-amber">
          <div className="sl">ROAS tổng</div>
          <div className="sv">{overallRoas.toFixed(2)}x</div>
          <div className="ss">Revenue / Ad Spend</div>
        </div>
        <div className="stat-card c-purple">
          <div className="sl">Khách hàng</div>
          <div className="sv">{stats.customers.toLocaleString("vi-VN")}</div>
          <div className="ss">tổng trong CSDL</div>
        </div>
      </div>

      {/* Row 2: Channel breakdown */}
      <div className="card" style={{ marginBottom: 12, padding: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
          💰 Doanh thu / Chi ads theo kênh (tháng {month})
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>Kênh</th>
              <th className="text-right">Chi ads</th>
              <th className="text-right">Doanh thu</th>
              <th className="text-right">ROAS</th>
              <th></th>
            </tr></thead>
            <tbody>
              <ChannelRow label="Facebook" link="/fb-pages" spend={stats.revenue.adSpend} revenue={stats.revenue.fromAds} />
              <ChannelRow label="Shopee" link="/shopee-ads" spend={stats.revenue.shopeeAdSpend} revenue={stats.revenue.shopeeRevenue} />
              <ChannelRow label="TikTok" link="/sales-leader" spend={stats.revenue.tiktokAdSpend} revenue={stats.revenue.tiktokRevenue} />
              <ChannelRow label="Web / API / Haravan" link="/web-app" spend={0} revenue={stats.revenue.salesSyncRevenue} />
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 3: Orders breakdown + Inventory + Damage */}
      <div id="dash-row2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
            📋 Đơn hàng theo giai đoạn
          </div>
          <div style={{ padding: 14 }}>
            {Object.entries(STAGE_LABEL).map(([stage, label]) => {
              const count = stats.orders[stage.toLowerCase() as keyof typeof stats.orders] as number || 0;
              const pct = stats.orders.total > 0 ? (count / stats.orders.total) * 100 : 0;
              return (
                <div key={stage} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span className={`stage-badge stage-${stage}`}>{label}</span>
                    <span style={{ fontWeight: 700 }}>{count}</span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--blue)" }} />
                  </div>
                </div>
              );
            })}
            <div style={{ textAlign: "right", marginTop: 12, fontSize: 13 }}>
              <Link href="/list" style={{ color: "var(--blue)" }}>Xem tất cả →</Link>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
            📦 Tồn kho
          </div>
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Tổng SKU</span>
              <span style={{ fontWeight: 700 }}>{stats.inventory.totalSkus.toLocaleString("vi-VN")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--red)" }}>
              <span>⛔ Hết hàng</span>
              <span style={{ fontWeight: 700 }}>{stats.inventory.outOfStock.toLocaleString("vi-VN")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--amber)" }}>
              <span>⚠ Sắp hết (≤5)</span>
              <span style={{ fontWeight: 700 }}>{stats.inventory.lowStock.toLocaleString("vi-VN")}</span>
            </div>
            <Link href="/inventory" className="btn btn-ghost btn-sm" style={{ textAlign: "center", textDecoration: "none" }}>
              Chi tiết tồn kho →
            </Link>
          </div>
        </div>
      </div>

      {/* Row 4: Finance + Damage */}
      <div id="dash-row3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>💵 Công nợ</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Tổng giá trị đơn (active)</span>
              <span style={{ fontWeight: 700 }}>{formatVND(stats.finance.totalOrderValue)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--green)" }}>
              <span>Đã cọc / thanh toán</span>
              <span style={{ fontWeight: 700 }}>{formatVND(stats.finance.totalDeposited)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--red)", borderTop: "0.5px solid var(--border)", paddingTop: 8 }}>
              <span><b>Còn nợ</b></span>
              <span style={{ fontWeight: 900 }}>{formatVND(stats.finance.outstanding)}</span>
            </div>
            <Link href="/finance?tab=debt" className="btn btn-ghost btn-sm" style={{ textAlign: "center", textDecoration: "none", marginTop: 4 }}>
              Xem công nợ →
            </Link>
          </div>
        </div>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>⚠ Hàng hỏng chờ xử lý</div>
          {stats.damage.pendingItems > 0 ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span>Số items</span>
                <span style={{ fontWeight: 700, color: "var(--red)" }}>{stats.damage.pendingItems}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span>Giá trị thiệt hại</span>
                <span style={{ fontWeight: 700, color: "var(--red)" }}>{formatVND(stats.damage.pendingValue)}</span>
              </div>
              <Link href="/finance?tab=damage" className="btn btn-danger btn-sm" style={{ textAlign: "center", textDecoration: "none", display: "block" }}>
                Xử lý ngay →
              </Link>
            </>
          ) : (
            <div className="muted" style={{ padding: 16, textAlign: "center" }}>
              ✅ Không có hàng hỏng chờ xử lý
            </div>
          )}
        </div>
      </div>

      {/* Recent orders */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
          <span>🕒 Đơn gần nhất</span>
          <Link href="/list" style={{ fontSize: 12, color: "var(--blue)" }}>Tất cả →</Link>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>Mã đơn</th>
              <th>Tên</th>
              <th>NCC</th>
              <th>Owner</th>
              <th>Giai đoạn</th>
              <th className="text-right">Giá trị</th>
              <th>Ngày tạo</th>
            </tr></thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.order_id}>
                  <td style={{ fontWeight: 700 }}>
                    <Link href={`/create?order_id=${o.order_id}`} style={{ color: "var(--blue)" }}>{o.order_id}</Link>
                  </td>
                  <td>{o.order_name || "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{o.supplier_name || "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{o.owner || "—"}</td>
                  <td><span className={`stage-badge stage-${o.stage}`}>{STAGE_LABEL[String(o.stage || "DRAFT")]}</span></td>
                  <td className="text-right font-bold">{formatVND(o.order_total)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{formatDate(o.created_at)}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>Chưa có đơn nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ChannelRow({ label, link, spend, revenue }: { label: string; link: string; spend: number; revenue: number }) {
  const roas = spend > 0 ? revenue / spend : 0;
  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{label}</td>
      <td className="text-right">{formatVND(spend)}</td>
      <td className="text-right font-bold">{formatVND(revenue)}</td>
      <td className="text-right" style={{ fontWeight: 700, color: roas >= 1 ? "var(--green)" : roas > 0 ? "var(--red)" : "var(--subtle)" }}>
        {spend > 0 ? roas.toFixed(2) + "x" : "—"}
      </td>
      <td className="text-right"><Link href={link} style={{ fontSize: 12, color: "var(--blue)" }}>Chi tiết →</Link></td>
    </tr>
  );
}
