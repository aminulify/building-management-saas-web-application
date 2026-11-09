import "@/styles/globals.css";

/** Last-resort 404 for URLs outside any locale (rare: the middleware adds /bn or /en to normal paths). */
export default function RootNotFound() {
  return (
    <html lang="bn">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          <div className="glass-card" style={{ padding: 40, maxWidth: 460 }}>
            <p style={{ fontSize: 56, fontWeight: 700, margin: 0 }}>404</p>
            <p style={{ margin: "8px 0 24px", color: "#475569" }}>Page not found · পেজটি পাওয়া যায়নি</p>
            <a className="btn btn-primary" href="/">AmaderGhor</a>
          </div>
        </main>
      </body>
    </html>
  );
}
