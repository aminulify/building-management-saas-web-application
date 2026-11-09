"use client";

import "@/styles/globals.css";

/** Only used if the root layout itself crashes. Deliberately dependency-free (no i18n, no providers). */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="bn">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          <div className="glass-card" style={{ padding: 40, maxWidth: 460 }} role="alert">
            <p style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Something went wrong · কিছু একটা সমস্যা হয়েছে</p>
            <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={reset}>Retry · আবার চেষ্টা করুন</button>
          </div>
        </main>
      </body>
    </html>
  );
}
