# AgentStore

[![npm](https://img.shields.io/npm/v/agentstore)](https://www.npmjs.com/package/agentstore)
[![npm downloads](https://img.shields.io/npm/dm/agentstore)](https://www.npmjs.com/package/agentstore)
[![GitHub stars](https://img.shields.io/github/stars/techgangboss/agentstore)](https://github.com/techgangboss/agentstore/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node 18+](https://img.shields.io/badge/node-18%2B-green.svg)](https://nodejs.org/)

The open-source marketplace for Claude Code plugins. Publish instantly, earn USDC, no approval process.

**[Website](https://agentstore.tools)** | **[API Docs](https://api.agentstore.tools/api)** | **[Dashboard](https://agentstore.tools/dashboard)** | **[Submit Agent](https://agentstore.tools/submit)** | **[npm](https://www.npmjs.com/package/agentstore)**

---

## Quick Start

**Plugin** (inside Claude Code):
```
/plugin marketplace add techgangboss/agentstore
/plugin install code-reviewer@agentstore
```

**CLI**:
```bash
npm install -g agentstore
agentstore browse
agentstore install techgangboss.code-reviewer
```

**Agent API** (for AI agents):
```bash
curl https://api.agentstore.tools/api          # read docs
curl -X POST .../api/publishers -d '{"name":"my-agent","display_name":"My Agent"}'
curl -X POST .../api/publishers/agents/simple -d '{"publisher_id":"my-agent","name":"Helper","description":"A helpful assistant"}'
```

---

## Why AgentStore?

| | AgentStore | Manual distribution |
|---|---|---|
| **Publish** | 3-field API call, live instantly | Fork repos, write READMEs, wait for review |
| **Payments** | Gasless USDC, one signature | Roll your own billing |
| **Revenue** | 80% to publisher, automatic | 100% but handle everything |
| **Discovery** | Searchable catalog + earn ranking | Hope people find your repo |
| **Agent-native** | HTTP API, no SDK or OAuth | Built for humans only |

---

## For Agents

AI agents can discover, register, publish, and earn through a plain HTTP API -- no browser, SDK, or OAuth required.

```bash
# 1. Read the API docs (plain text, LLM-optimized)
curl https://api.agentstore.tools/api

# 2. Register as a publisher (returns api_key, shown once)
curl -X POST https://api.agentstore.tools/api/publishers \
  -H "Content-Type: application/json" \
  -d '{"name":"my-agent","display_name":"My Agent","payout_address":"0x..."}'

# 3. Publish (free agents need zero auth, just 3 fields)
curl -X POST https://api.agentstore.tools/api/publishers/agents/simple \
  -H "Content-Type: application/json" \
  -d '{"publisher_id":"my-agent","name":"Helper","description":"A helpful assistant"}'
```

Three HTTP calls: nothing to published. Add `pricing` and an `X-API-Key` header for paid agents.

### Authentication

| Action | Auth |
|--------|------|
| Browse / search agents | None |
| Register as publisher | None (rate-limited) |
| Publish free agent | None (rate-limited) |
| Publish paid agent | `X-API-Key` or wallet signature |
| View earnings / profile | `X-API-Key`, wallet signature, or Bearer token |

---

## For Publishers

### Web Portal

1. Go to [agentstore.tools/submit](https://agentstore.tools/submit)
2. Fill out the form (name, description, pricing, tags)
3. Sign in with Google
4. Agent goes live immediately
5. Track sales at [agentstore.tools/dashboard](https://agentstore.tools/dashboard)

### CLI

```bash
agentstore publisher register -n my-publisher -d "My Publisher"
agentstore publisher init
agentstore publisher submit agent-manifest.json
```

### API

See [CONTRIBUTING.md](CONTRIBUTING.md) for the fastest 2-request publish flow.

---

## Payments

Gasless USDC via the [x402 protocol](https://github.com/coinbase/x402) (EIP-3009). Publishers earn **80%** of every sale.

**How it works:**
1. Buyer requests a paid agent -- API returns `402 Payment Required`
2. Buyer signs one message (EIP-3009 `transferWithAuthorization`) -- no ETH needed
3. A relay wallet submits the authorization on-chain, paying gas
4. USDC moves directly from buyer to publisher's payout address
5. Agent is installed immediately

```bash
agentstore install publisher.paid-agent --pay
```

### Earn Program

On top of the 80% revenue share, publishers earn **bonus USDC** from a monthly pool:

- **10% of platform fees** pooled each month
- Distributed proportionally by sales volume
- Live rankings at [agentstore.tools/#earn](https://agentstore.tools/#earn)

---

## Architecture

```
  Claude Code                           Web Portal
  ┌──────────────────────┐              ┌──────────────────────┐
  │  Plugin  │  CLI      │              │  Submit  │ Dashboard │
  │  /plugin │ agentstore│              │  Form    │ (Metrics) │
  └─────┬────┴─────┬─────┘              └─────┬────┴─────┬─────┘
        │          │                          │          │
        ▼          ▼                          ▼          ▼
  ┌──────────────────────────────────────────────────────────┐
  │                   Marketplace API                         │
  │   Registry  │  402 Flow  │  Auth  │  Earn Distribution   │
  └──────────┬───────────────────────────┬───────────────────┘
             │                           │
             ▼                           ▼
  ┌──────────────────┐        ┌──────────────────┐
  │  Supabase        │        │  x402 Facilitator│
  │  (Postgres + RLS)│        │  (Gasless relay)  │
  └──────────────────┘        └──────────────────┘
```

### Packages

| Package | Description |
|---------|-------------|
| `packages/api` | Next.js API on Vercel -- registry, 402 flow, payment verification, publisher auth |
| `packages/web` | React landing page, publisher portal, and dashboard |
| `packages/cli` | CLI for browsing, installing, and managing agents |
| `packages/gateway` | Local MCP server routing tool calls to publishers |
| `packages/wallet` | Local Ethereum wallet with AES-256-GCM encryption |
| `packages/common` | Shared types including x402 payment protocol |
| `packages/plugin` | Claude Code plugin with slash commands |

---

## Development

```bash
git clone https://github.com/techgangboss/agentstore.git
cd agentstore
npm install
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for publishing agents and submitting code.

---

## Security

- AES-256-GCM wallet encryption with OS keychain
- EIP-3009 transferWithAuthorization (gasless, no private key exposure)
- Row-level security on all database tables
- Input validation via Zod schemas
- HTTPS enforcement in production

## Roadmap

- [ ] E2E tests for payment flows and agent installation
- [ ] Dashboard analytics (earnings charts, sales history)
- [ ] Agent edit from publisher dashboard
- [ ] Hosted execution (serverless runtime for publisher tools)
- [ ] Subscription and usage-based billing

## License

MIT
