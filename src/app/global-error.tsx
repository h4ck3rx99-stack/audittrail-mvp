"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 48, textAlign: "center" }}>
        <h1 style={{ fontSize: 16 }}>AuditTrail is temporarily unavailable</h1>
        <p style={{ fontSize: 13, color: "#52525b" }}>Try again in a moment.</p>
        {error.digest ? <p style={{ fontSize: 12, color: "#71717a" }}>Reference: {error.digest}</p> : null}
        <button onClick={() => reset()} style={{ marginTop: 16, padding: "6px 12px" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
