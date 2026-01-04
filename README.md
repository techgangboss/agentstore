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

## Publisher Registration

To publish agents on AgentStore, you need to register as a publisher:

```bash
# First, create a wallet (if you haven't already)
agentstore wallet setup

# Register as a publisher
agentstore publisher register \
  --id my-company \
  --name "My Company" \
  --support-url https://support.mycompany.com

# The CLI will sign a message with your wallet to prove ownership
# Your payout address will be set to your wallet address
```

### Registration Requirements
- **Publisher ID**: Lowercase alphanumeric with hyphens (e.g., `acme-corp`)
- **Display Name**: Human-readable name shown in marketplace
- **Payout Address**: Your wallet address (verified via signature)
- **Support URL**: Optional link for user support

### Rate Limits
- Publisher registration: 3 requests per hour per IP
- Agent submissions: 10 requests per minute per IP

## Fiat Onramp (Credit Card → ETH)

Fund your wallet with a credit card via Coinbase Onramp:

```bash
# Fund wallet (opens browser)
agentstore wallet fund

# Fund with specific amount
agentstore wallet fund --amount 50

# Fund and wait for confirmation
agentstore wallet fund --amount 25 --wait

# Just print the URL (don't open browser)
agentstore wallet fund --no-open
```

### How It Works
1. CLI requests a secure session token from the API
2. Opens Coinbase Onramp in your browser with pre-filled wallet address
3. Complete purchase with credit card, Apple Pay, or bank transfer
4. ETH arrives in your wallet within minutes

### Server Configuration (Vercel)
To enable fiat onramp, add Coinbase CDP credentials to Vercel:

```
CDP_API_KEY_NAME=organizations/.../apiKeys/...
CDP_API_KEY_PRIVATE_KEY=-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----
```

Get CDP credentials at: https://portal.cdp.coinbase.com/

## Environment Variables

### API (Vercel)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
PLATFORM_FEE_ADDRESS=0x...
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io   # Optional - enables persistent rate limiting
UPSTASH_REDIS_REST_TOKEN=AXxx...                # Optional - falls back to in-memory if not set
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
| CLI wallet commands | ✅ Complete (setup, balance, history, address) |
| CLI direct payment | ✅ Complete (`--pay` flag for automatic ETH payment) |
| CLI publisher commands | ✅ Complete (register, info) |
| CLI fiat onramp | ✅ Complete (wallet fund with Coinbase) |
| Publisher registration API | ✅ Complete (wallet signature verification) |
| Fiat onramp API | ✅ Complete (Coinbase CDP integration) |
| Gateway routing | ✅ Complete |
| Wallet encryption | ✅ Complete |
| Spend limits | ✅ Complete |
| Redis rate limiting | ✅ Complete (Upstash, with in-memory fallback) |
| RLS policies | ✅ Complete |
| Security headers | ✅ Complete |

## What's Needed for Full Launch

### High Priority

| Item | Description | Effort |
|------|-------------|--------|
| **Publisher registration API** | ✅ Complete - `/api/publishers` with wallet signature verification and CLI command. | Done |
| **Fiat onramp** | ✅ Complete - Coinbase CDP integration with `wallet fund` CLI command. | Done |
| **Global npm install** | Publish `@agentstore/cli` and `@agentstore/gateway` to npm for `npm install -g`. | 2-3 hrs |
| **E2E test with real ETH** | Full purchase flow on mainnet with actual payment and verification. | 2-3 hrs |

### Medium Priority

| Item | Description | Effort |
|------|-------------|--------|
| **Agent version updates** | Schema exists (`agent_versions` table) but API endpoints not wired. | 3-4 hrs |
| **Upstash Redis setup** | Rate limiting now uses Redis via Upstash. Need to provision Upstash Redis and set env vars in Vercel. | 1 hr |

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
