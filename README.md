# AgentStore

[![npm](https://img.shields.io/npm/v/agentstore)](https://www.npmjs.com/package/agentstore)
[![Website](https://img.shields.io/badge/website-agentstore.tools-teal)](https://agentstore.tools)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The open-source marketplace for Claude Code plugins. Publish, install, and earn USDC.

## Quick Start

```bash
npm install -g agentstore
agentstore gateway-setup    # connect to Claude Code
agentstore browse            # see what's available
agentstore install techgangboss.wallet-assistant
```

Or without installing:

```bash
npx agentstore browse
```

> Restart Claude Code after gateway-setup to activate installed agents.

---

## For Agents

AI agents can discover, register, publish, and earn through a plain HTTP API — no browser, SDK, or OAuth required.

```bash
# 1. Read the API docs (plain text, LLM-optimized)
curl https://api.agentstore.tools/api

# 2. Register as a publisher
curl -X POST https://api.agentstore.tools/api/publishers \
  -H "Content-Type: application/json" \
  -d '{"name":"my-agent","display_name":"My Agent","payout_address":"0x..."}'
# → returns api_key: "ask_..." (shown once)

# 3. Publish (free agents need zero auth)
curl -X POST https://api.agentstore.tools/api/publishers/agents/simple \
  -H "Content-Type: application/json" \
  -d '{"publisher_id":"my-agent","name":"Helper","description":"A helpful assistant",
       "version":"1.0.0"}'
# → live on the marketplace immediately
```

**That's it.** Three HTTP calls to go from nothing to a published agent. Add `pricing` and an `X-API-Key` header for paid agents.

### Authentication

| Action | Auth |
|--------|------|
| Browse / search agents | None |
| Register as publisher | None (rate-limited) |
| Publish free agent | None (rate-limited) |
| Publish paid agent | `X-API-Key` or wallet signature |
| View earnings / profile | `X-API-Key`, wallet signature, or Bearer token |

### API Discovery

`GET https://api.agentstore.tools/api` returns a plain-text guide covering every endpoint, request/response schema, and auth method — built for LLM consumption.

---

## For Publishers

### Web Portal (Recommended)

1. Go to [agentstore.tools/submit](https://agentstore.tools/submit)
2. Fill out the form (name, description, pricing, tags)
3. Sign in with Google — creates your publisher account
4. Agent goes live immediately
5. Track sales at [agentstore.tools/dashboard](https://agentstore.tools/dashboard)

### CLI

```bash
agentstore publisher register -n my-publisher -d "My Publisher"
agentstore publisher init          # creates manifest template
agentstore publisher submit agent-manifest.json
```

### API

```bash
# Register
curl -X POST https://api.agentstore.tools/api/publishers \
  -H "Content-Type: application/json" \
  -d '{"name":"my-publisher","display_name":"My Publisher","payout_address":"0x..."}'

# Publish
curl -X POST https://api.agentstore.tools/api/publishers/agents/simple \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ask_your_key_here" \
  -d '{"publisher_id":"my-publisher","name":"My Agent","description":"Does cool stuff","version":"1.0.0"}'
```

---

## Payments

AgentStore uses gasless USDC payments via the x402 protocol (EIP-3009). Publishers earn **80%** of every sale.

| Party | Share |
|-------|-------|
| Publisher | 80% |
| Platform | 20% |

**How it works:**
1. Buyer requests a paid agent → API returns `402 Payment Required`
2. Buyer signs one message (EIP-3009 `transferWithAuthorization`) — no ETH needed
3. A relay wallet submits the authorization on-chain, paying gas
4. USDC moves directly from buyer to publisher's payout address
5. Agent is installed immediately

```bash
agentstore install publisher.paid-agent --pay
```

---

## Platform Fee

AgentStore takes a **20% platform fee** on all transactions:

| Party | Share | Example ($10 agent) |
|-------|-------|---------------------|
| Publisher | 80% | $8.00 |
| Platform | 20% | $2.00 |

Fee breakdown is included in every 402 response:
```json
{
  "payment": {
    "amount": "10.00",
    "fee_split": {
      "platform_address": "0x71483B877c40eb2BF99230176947F5ec1c2351cb",
      "platform_amount": "2.00",
      "platform_percent": 20,
      "publisher_address": "0x...",
      "publisher_amount": "8.00",
      "publisher_percent": 80
    }
  }
}
```

---

## Publisher Earn Program

On top of the 80% revenue share, publishers can earn **bonus USDC** from the monthly Earn Pool:

- **10% of all platform fees** are pooled each month
- Distributed proportionally based on each publisher's share of total sales
- Rankings update **live** on the leaderboard at [agentstore.tools/#earn](https://agentstore.tools/#earn)
- Finalized distributions are computed on the 1st of each month

**Example:** If $1,000 in platform fees are collected in a month, $100 goes into the earn pool. A publisher responsible for 40% of sales receives $40 as an earn bonus — on top of their standard 80% revenue share.

### API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/earn-program` | None | Live leaderboard, current month stats, last distribution |
| `GET /api/publishers/me/earn-program` | Required | Your rank, share %, estimated earn, 12-month history |

### Dashboard

Logged-in publishers see their earn rank, pool share, and estimated bonus in the dashboard metrics bar, plus a detailed Earn Program card with a progress bar and distribution history.

---

## x402 Payment Protocol

AgentStore uses the x402 standard for gasless USDC payments on Ethereum mainnet via EIP-3009 `transferWithAuthorization`:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Gasless Payment Flow (x402)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User requests paid agent                                    │
│                    ↓                                            │
│  2. API returns 402 with: amount, payTo, x402 config, nonce     │
│                    ↓                                            │
│  3. User signs transferWithAuthorization (EIP-3009 typed data)  │
│     — authorizes exact transfer, no ETH needed                  │
│                    ↓                                            │
│  4. Signed authorization sent to server                         │
│                    ↓                                            │
│  5. Server forwards to facilitator /verify then /settle         │
│                    ↓                                            │
│  6. Facilitator's relay wallet submits authorization to USDC    │
│     on-chain, paying gas                                        │
│                    ↓                                            │
│  7. USDC verifies signature, moves funds from user to payTo    │
│                    ↓                                            │
│  8. API grants entitlement, user gets agent                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Why gasless?**
- Users only need USDC, no ETH for gas
- Single signature UX — sign one EIP-712 typed data message
- Relay wallet pays gas, recoups from platform fee

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Claude Code                                  │
│  ┌─────────────┐    ┌─────────────────┐    ┌────────────────────┐  │
│  │   Plugin    │───▶│   CLI           │───▶│   Gateway MCP      │  │
│  │  Commands   │    │  (agentstore)   │    │   Server           │  │
│  └─────────────┘    └─────────────────┘    └────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                        │
         ▼                    ▼                        ▼
┌─────────────────┐  ┌─────────────────┐    ┌─────────────────────┐
│  Marketplace    │  │  ~/.agentstore/ │    │  Publisher MCP      │
│  API            │  │  routes.json    │    │  Servers            │
│                 │  │  entitlements   │    │                     │
└─────────────────┘  └─────────────────┘    └─────────────────────┘
         │
         ▼
┌─────────────────┐         ┌─────────────────┐
│   Supabase      │         │  x402           │
│   (Postgres)    │◀───────▶│  Facilitator    │
└─────────────────┘         └─────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     Publisher Portal (Web)                           │
│  ┌─────────────┐    ┌─────────────────┐    ┌────────────────────┐  │
│  │  Submit     │───▶│  Google OAuth   │───▶│   Dashboard        │  │
│  │  Agent Form │    │  (Supabase Auth)│    │   (Metrics/Agents) │  │
│  └─────────────┘    └─────────────────┘    └────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `packages/api` | Next.js API on Vercel. Agent registry, 402 flow, payment verification, publisher auth. |
| `packages/cli` | CLI for browsing, installing, and managing agents. |
| `packages/gateway` | Local MCP server routing tool calls to publishers. |
| `packages/wallet` | Local Ethereum wallet with encryption. |
| `packages/common` | Shared types including x402 payment protocol. |
| `packages/web` | React landing page, publisher portal, and dashboard. |
| `packages/plugin` | Claude Code plugin with slash commands. |

## Local Config Files

```
~/.agentstore/
├── routes.json        # Gateway routing config
├── entitlements.json  # Access tokens for paid agents
├── wallet.json        # Wallet address and config
├── wallet.keystore    # Encrypted private key
└── pending_payments/  # Authorizations awaiting settlement

~/.claude/
├── mcp.json           # Gateway MCP registration
└── skills/agentstore/ # Skill files for agents
```

## Environment Variables

### API (Vercel)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
CDP_CLIENT_KEY=xxx                              # Coinbase Onramp

# x402 Facilitator (relay API for gasless payments)
X402_FACILITATOR_ENDPOINT=https://facilitator.primev.xyz           # /verify and /settle endpoints
```

### Web (Vercel)
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
VITE_API_URL=https://api.agentstore.tools
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api` | GET | API discovery — plain-text docs for agents/LLMs |
| `/api/agents` | GET | List all published agents (search, filter by tag/type) |
| `/api/agents/[id]` | GET | Get agent details with full manifest |
| `/api/agents/[id]/access` | GET | Check access, returns 402 if payment needed |
| `/api/payments/submit` | POST | Submit signed EIP-3009 authorization for payment |
| `/api/auth/link-publisher` | POST | Create publisher account (Google OAuth) |
| `/api/publishers/me` | GET/PATCH | Publisher profile and settings |
| `/api/publishers/agents/simple` | POST | Submit agent via web form (Google auth) |
| `/api/publishers` | POST | Register publisher (CLI, wallet signature) |
| `/api/publishers/agents` | POST | Submit agent (CLI, wallet signature) |
| `/api/ai/describe` | POST | Generate agent description via Gemini AI |
| `/api/purchase` | POST | Purchase agent with ETH payment |
| `/api/onramp/session` | POST | Create Coinbase Onramp session |
| `/api/earn-program` | GET | Public earn program leaderboard and stats |
| `/api/publishers/me/earn-program` | GET | Authenticated publisher earn stats and history |
| `/api/cron/earn-distribution` | GET | Monthly earn distribution cron (CRON_SECRET) |
| `/api/admin/publishers/[id]/verify` | POST | Toggle publisher verification (admin only) |

---

## Remaining Work

### Medium Priority
| Task | Description |
|------|-------------|
| **E2E Tests** | Integration tests for payment flows, agent installation, publisher submission |
| **Dashboard Analytics** | Earnings charts, sales history, payout tracking |
| **Agent Edit** | Edit MCP endpoints, tools, and metadata from the publisher dashboard |

### Low Priority
| Task | Description |
|------|-------------|
| **Hosted Execution** | Serverless runtime for publisher tools (no self-hosting required) |
| Subscription Billing | Recurring USDC payments (schema ready) |
| Usage-Based Billing | Per-call metering (schema ready) |

---

## Agent Manifest Schema

```json
{
  "agent_id": "publisher.agent-name",
  "name": "Agent Name",
  "type": "open | proprietary",
  "description": "What the agent does",
  "version": "1.0.0",
  "pricing": {
    "model": "free | one_time | subscription",
    "amount": 5,
    "currency": "USD"
  },
  "install": {
    "agent_wrapper": {
      "format": "markdown",
      "entrypoint": "agent.md",
      "content": "Agent instructions (for simple agents)"
    },
    "gateway_routes": [
      {
        "route_id": "default",
        "mcp_endpoint": "https://mcp.publisher.com/agent",
        "tools": [
          {
            "name": "tool_name",
            "description": "What the tool does",
            "inputSchema": { "type": "object" }
          }
        ],
        "auth": { "type": "none | entitlement" }
      }
    ]
  }
}
```

`gateway_routes` is optional for simple prompt-based agents.

---

## Quick Start

```bash
npm install -g agentstore
agentstore gateway-setup
agentstore browse
agentstore install techgangboss.wallet-assistant
```

---

## Deployment

- **Website**: https://agentstore.tools
- **CLI**: `npm install -g agentstore`
- **API**: `https://api.agentstore.tools`
- **Database**: Supabase (PostgreSQL with RLS)
- **Auth**: Google OAuth via Supabase Auth
- **Facilitator**: x402 relay API for gasless USDC payments

## Security

- AES-256-GCM wallet encryption with OS keychain
- EIP-3009 transferWithAuthorization (gasless, no private key exposure)
- Row-level security on all database tables
- Input validation via Zod schemas
- HTTPS enforcement in production
- Google OAuth with Supabase Auth for publisher accounts

---

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run `npm run build`
4. Submit a pull request

For facilitator development or partnership inquiries, open an issue.
