export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>LK Outreach Sender</h1>
      <p>API-only app. Use the endpoints below.</p>
      <ul>
        <li><code>POST /api/integration/leads/receive</code> — Lead Gen webhook (batch, spec payload)</li>
        <li><code>POST /api/leads</code> — Ingest lead (generic), AI-generate message, optionally send</li>
        <li><code>POST /api/leads/[id]/generate</code> — Regenerate AI message</li>
        <li><code>POST /api/leads/[id]/send</code> — Send WhatsApp + email for a lead</li>
        <li><code>GET /api/sender/queue</code> — Pending WhatsApp items (for sender service)</li>
        <li><code>GET /api/health</code> — Health check (app + DB)</li>
        <li><code>POST /api/sender/mark-sent</code> / <code>mark-failed</code> — Update send status</li>
        <li><code>POST /api/sender/reply</code> — Record a reply on a send</li>
      </ul>
    </main>
  );
}
