// CSKH tab — trong gs.txt gốc, tab này chỉ là cầu nối fetch summary
// từ CSKH Manager (1 Google Apps Script riêng khác). Giữ placeholder
// link ra ngoài; khi CSKH Manager cũng migrate sang Next.js, thay URL.

const CSKH_URL = "https://script.google.com/a/macros/vuabanlo.vn/s/AKfycbwYQG6EsXhTCfVpCpjwGCRPUne-HcU8wo6voYQYn35ISjprljojY8k2gv7HKgPBdKxr/exec";

export default function CskhPage() {
  return (
    <section className="section">
      <div className="page-hdr">
        <div>
          <div className="page-title">💬 CSKH</div>
          <div className="page-sub">Cầu nối sang hệ thống CSKH Manager</div>
        </div>
      </div>

      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 15, color: "var(--muted)", marginBottom: 16 }}>
          CSKH Manager là ứng dụng riêng, chưa migrate sang đây. Mở ở tab mới:
        </div>
        <a
          href={CSKH_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
          style={{ textDecoration: "none" }}
        >
          🔗 Mở CSKH Manager
        </a>
      </div>
    </section>
  );
}
