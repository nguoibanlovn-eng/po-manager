export default function DashLoading() {
  return (
    <section className="section" id="dash-day" style={{ padding: 0 }}>
      {/* Header + skeleton — mobile only */}
      <div className="dash-mobile-only" style={{ background: "#F8FAFC", minHeight: "100vh" }}>
        <div style={{ background: "linear-gradient(135deg,#7C3AED,#4C1D95)", padding: "14px 14px 16px", color: "#fff" }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Dashboard</div>
          <div style={{ fontSize: 11, opacity: .6 }}>Đang tải...</div>
        </div>
        <div style={{ padding: "10px 10px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="skeleton" style={{ width: "100%", height: 130, borderRadius: 14 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="skeleton" style={{ height: 70, borderRadius: 14 }} />
            <div className="skeleton" style={{ height: 70, borderRadius: 14 }} />
          </div>
          <div className="skeleton" style={{ height: 90, borderRadius: 12 }} />
          <div className="skeleton" style={{ height: 90, borderRadius: 12 }} />
          <div className="skeleton" style={{ height: 90, borderRadius: 12 }} />
        </div>
      </div>

      {/* Desktop skeleton */}
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="skeleton" style={{ width: 120, height: 22, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 180, height: 14, borderRadius: 4, marginTop: 4 }} />
          </div>
        </div>
        <div className="skeleton" style={{ width: "100%", height: 140, borderRadius: 14 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div className="skeleton" style={{ height: 80, borderRadius: 14 }} />
          <div className="skeleton" style={{ height: 80, borderRadius: 14 }} />
        </div>
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
