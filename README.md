# AgentStore

An open-source marketplace for Claude Code plugins with cryptocurrency payments.

**One-line:** Users browse, pay, and install MCP-backed agents directly from Claude Code — no manual configuration required.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Claude Code                                  │
│  ┌─────────────┐    ┌─────────────────┐    ┌────────────────────┐  │
│  │   Plugin    │───▶│   CLI           │───▶│   Gateway MCP      │  │
│  │  Commands   │    │  (agentstore)   │    │   Server           │  │
│  └─────────────┘    └─────────────────┘    └────────────────────┘  │
│        │                    │                        │              │
└────────│────────────────────│────────────────────────│──────────────┘
         │                    │                        │
         ▼                    ▼                        ▼
┌─────────────────┐  ┌─────────────────┐    ┌─────────────────────┐
│  Marketplace    │  │  ~/.agentstore/ │    │  Publisher MCP      │
│  API (Vercel)   │  │  routes.json    │    │  Servers            │
│                 │  │  entitlements   │    │  (remote endpoints) │
└─────────────────┘  │  wallet.json    │    └─────────────────────┘
         │           └─────────────────┘
         ▼
┌─────────────────┐
│   Supabase      │
│   (Postgres)    │
└─────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `packages/api` | Next.js API deployed to Vercel. Handles agent registry, search, and purchase verification. |
| `packages/cli` | Command-line tool for browsing, installing, and managing agents. Writes local config files. |
| `packages/gateway` | Local MCP server that routes tool calls to publisher endpoints and attaches auth tokens. |
| `packages/wallet` | Local Ethereum wallet with AES-256 encryption, spend limits, and transaction history. |
| `packages/wallet-agent` | Example free agent that exposes wallet query tools via MCP. |
| `packages/plugin` | Claude Code plugin with slash commands (`/browse`, `/install-agent`, `/wallet`, `/my-agents`). |
| `packages/common` | Shared TypeScript types, Zod validators, and Result utilities. |

## Features

### Marketplace API
- **Agent Registry**: Publishers list agents with manifests defining tools, pricing, and MCP endpoints.
- **Search & Filter**: Query agents by name, description, or tags.
- **Purchase Verification**: Validates ETH payments on-chain via mev-commit RPC with preconfirmation support.
- **Rate Limiting**: 60 req/min general, 10 req/min for purchases.
- **RLS Security**: All database tables have Row Level Security enabled.

### CLI (`agentstore`)
- **browse**: List agents from the marketplace with search and tag filtering.
- **install**: Fetch agent manifest, write gateway routes, save entitlements, create skill files.
- **list**: Show installed agents and their available tools.
- **uninstall**: Remove routes, entitlements, and skill files.
- **config**: Display configuration paths and gateway status.
- **gateway-setup**: Add the gateway MCP server to Claude's `~/.claude/mcp.json`.

### Gateway MCP Server
- **Tool Routing**: Proxies tool calls to publisher MCP endpoints based on `routes.json`.
- **Auth Injection**: Attaches entitlement tokens to requests for paid agents.
- **Tool Discovery**: Exposes all installed agent tools to Claude via `ListTools`.
- **Validation**: Zod schemas validate route configs; path traversal protection on config files.

### Wallet
- **Key Generation**: Creates Ethereum keypairs locally using viem.
- **Encryption**: AES-256-GCM with PBKDF2 key derivation (100k iterations).
- **OS Keychain**: Stores encryption password in macOS Keychain / Linux Secret Service.
- **Spend Limits**: Per-transaction ($100), daily ($500), weekly ($2000) caps.
- **Publisher Allowlist**: Optionally restrict payments to approved addresses.
- **mev-commit RPC**: Uses preconfirmations for faster payment UX.

### Database (Supabase)
- **Tables**: `publishers`, `agents`, `agent_versions`, `entitlements`, `transactions`, `tags`, `agent_tags`
- **Indexes**: Optimized for download count, created_at, featured agents, wallet lookups.
- **Atomic Purchases**: `atomic_purchase()` function prevents race conditions with row-level locking.

## Local Config Files

```
~/.agentstore/
├── routes.json        # Gateway routing: agent → MCP endpoint + tools
├── entitlements.json  # Auth tokens for paid agents
├── wallet.json        # Wallet address, network, spend limits
├── wallet.keystore    # Encrypted private key
└── tx_history.json    # Transaction records

~/.claude/
├── mcp.json           # MCP server configuration (gateway registered here)
└── skills/agentstore/ # Skill files for installed agents
```

## Quick Start

```bash
# Clone and install
git clone https://github.com/techgangboss/agentstore.git
cd agentstore
npm install

# Build all packages
npm run build

# Browse marketplace
node packages/cli/dist/index.js browse

# Install a free agent
node packages/cli/dist/index.js install techgangboss.wallet-assistant

# Setup gateway in Claude's MCP config
node packages/cli/dist/index.js gateway-setup

# Restart Claude Code to load the gateway
```

## Environment Variables

### API (Vercel)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
PLATFORM_FEE_ADDRESS=0x...
```

### Wallet (Optional)
```
AGENTSTORE_WALLET_PASSWORD=your-password  # Skip keychain prompt
```

## What's Working

| Component | Status |
|-----------|--------|
| Agent listing API | ✅ Complete |
| Agent detail API | ✅ Complete |
| Purchase verification | ✅ Complete (ETH + preconfirmations) |
| CLI browse/install/list | ✅ Complete |
| Gateway routing | ✅ Complete |
| Wallet encryption | ✅ Complete |
| Spend limits | ✅ Complete |
| RLS policies | ✅ Complete |
| Security headers | ✅ Complete |

## What's Needed for Full Launch

### High Priority

| Item | Description | Effort |
|------|-------------|--------|
| **Wallet CLI integration** | CLI currently requires `--tx-hash` for paid agents. Need to integrate wallet signing so users can pay directly from CLI. | 4-6 hrs |
| **Publisher registration API** | Currently publishers are added via direct DB insert. Need `/api/publishers/register` endpoint with validation. | 3-4 hrs |
| **Global npm install** | Publish `@agentstore/cli` and `@agentstore/gateway` to npm for `npm install -g`. | 2-3 hrs |
| **E2E test with real ETH** | Full purchase flow on mainnet with actual payment and verification. | 2-3 hrs |

### Medium Priority

| Item | Description | Effort |
|------|-------------|--------|
| **Agent version updates** | Schema exists (`agent_versions` table) but API endpoints not wired. | 3-4 hrs |
| **Redis rate limiting** | Current in-memory rate limiter resets on Vercel deploy. | 2-3 hrs |
| **Chainlink price oracle** | Replace CoinGecko with Chainlink for more reliable ETH/USD pricing. | 2-3 hrs |
| **Fiat onramp** | Coinbase Onramp integration for credit card → ETH. | 4-6 hrs |

### Low Priority

| Item | Description | Effort |
|------|-------------|--------|
| **Connector checksums** | Verify agent artifacts with SHA256 hashes. | 2-3 hrs |
| **Subscription billing** | Schema supports it, need cron job to check expirations. | 4-6 hrs |
| **Usage-based billing** | Metering headers from publisher MCP servers. | 6-8 hrs |

## Agent Manifest Schema

```json
{
  "agent_id": "publisher.agent-name",
  "name": "Agent Name",
  "type": "open | proprietary",
  "description": "What the agent does",
  "version": "1.0.0",
  "publisher": {
    "publisher_id": "publisher",
    "display_name": "Publisher Name"
  },
  "pricing": {
    "model": "free | one_time | subscription",
    "amount": 0,
    "currency": "ETH"
  },
  "install": {
    "gateway_routes": [
      {
        "route_id": "default",
        "mcp_endpoint": "https://mcp.publisher.com/agent",
        "tools": [
          {
            "name": "tool_name",
            "description": "What the tool does",
            "inputSchema": { "type": "object", "properties": {} }
          }
        ],
        "auth": { "type": "none | entitlement | api_key" }
      }
    ]
  },
  "permissions": {
    "requires_network": true,
    "requires_filesystem": false
  }
}
```

## Deployment

### Supabase
- Project ID: `pqjntpkfdcfsvnnjkbny`
- All tables RLS-enabled
- Migrations in `supabase/migrations/`

### Vercel (API)
- URL: `https://api-inky-seven.vercel.app`
- Auto-deploys from `main` branch
- Environment variables configured in Vercel dashboard

## Security

- **Wallet encryption**: AES-256-GCM with OS keychain integration
- **Path sanitization**: Prevents traversal attacks on config files
- **Input validation**: Zod schemas on all API inputs
- **HTTPS enforcement**: Production gateway rejects non-HTTPS endpoints
- **Replay protection**: Transaction hashes are unique in database
- **RLS policies**: Database access scoped appropriately
- **CSP headers**: Configured in Next.js for API routes

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run build` and `npm run test`
5. Submit a pull request

For publisher onboarding or partnership inquiries, open an issue.
