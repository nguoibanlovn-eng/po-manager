export default function DashLoading() {
  return (
    <section className="section" style={{ padding: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Header skeleton */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="skeleton" style={{ width: 120, height: 22, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 180, height: 14, borderRadius: 4, marginTop: 4 }} />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <div className="skeleton" style={{ width: 50, height: 30, borderRadius: 8 }} />
            <div className="skeleton" style={{ width: 50, height: 30, borderRadius: 8 }} />
          </div>
        </div>

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
