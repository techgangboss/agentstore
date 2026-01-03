export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>AgentStore API</h1>
      <p>Claude Code Plugin Marketplace</p>
      <h2>Endpoints</h2>
      <ul>
        <li><code>GET /api/agents</code> - List agents</li>
        <li><code>GET /api/agents/:id</code> - Get agent details</li>
        <li><code>POST /api/purchase</code> - Purchase agent</li>
      </ul>
    </main>
  );
}
