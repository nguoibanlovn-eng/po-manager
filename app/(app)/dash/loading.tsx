export default function DashLoading() {
  return (
    <section className="section" id="dash-day" style={{ padding: 0 }}>
      {/* Header — chuẩn tím giống 3 dashboard */}
      <div className="dash-mobile-only" style={{ background: "linear-gradient(135deg,#7C3AED,#4C1D95)", padding: "14px 14px 16px", color: "#fff" }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Dashboard</div>
        <div style={{ fontSize: 11, opacity: .6 }}>Đang tải...</div>
      </div>

      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Hero skeleton */}
        <div className="skeleton" style={{ width: "100%", height: 140, borderRadius: 14 }} />

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div className="skeleton" style={{ height: 80, borderRadius: 14 }} />
          <div className="skeleton" style={{ height: 80, borderRadius: 14 }} />
        </div>

        {/* Cards */}
        <div className="skeleton" style={{ height: 100, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 100, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 100, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 100, borderRadius: 12 }} />
      </div>

      <style>{`
        .skeleton {
          background: linear-gradient(90deg, #E2E8F0 25%, #F1F5F9 50%, #E2E8F0 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </section>
  );
}
