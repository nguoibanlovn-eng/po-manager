export default function Loading() {
  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div style={{ width: 180, height: 20, background: "#E5E7EB", borderRadius: 6 }} />
          <div style={{ width: 120, height: 12, background: "#F3F4F6", borderRadius: 4, marginTop: 6 }} />
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        {/* Skeleton rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ padding: "10px 14px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 80, height: 12, background: "#F3F4F6", borderRadius: 4 }} />
            <div style={{ flex: 1, height: 12, background: "#F3F4F6", borderRadius: 4 }} />
            <div style={{ width: 60, height: 12, background: "#F3F4F6", borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </section>
  );
}
