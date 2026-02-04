# AgentStore

An open-source marketplace for Claude Code plugins with gasless USDC payments.

**One-liner:** Browse, pay, and install MCP-backed agents directly from Claude Code — with gasless USDC payments via the x402 protocol.

## Project Status: MVP Ready

| Category | Status | Notes |
|----------|--------|-------|
| Core Infrastructure | ✅ Complete | API, CLI, Gateway, Publisher Flow |
| Payment Protocol | ✅ Complete | x402 types, 402 flow, permits, 20% platform fee |
| Marketplace API | ✅ Live | `https://api-inky-seven.vercel.app` |
| Landing Page | ✅ Live | `https://agentstore.tools` |
| Publisher Portal | ✅ Live | Submit agents, Google OAuth, dashboard |
| npm Package | ✅ Published | `npm install -g @agentstore/cli` |
| x402 Facilitator | ⏳ Pending | Contract needed for gasless payments |

---

## Features

- **Gasless USDC Payments** — Users sign ERC-2612 permits, no ETH needed
- **Instant Agent Installation** — Tools available immediately via MCP gateway
- **Publisher Portal** — Submit agents via web form with Google OAuth
- **Publisher Dashboard** — Track agents, sales, and earnings
- **Publisher Monetization** — 80/20 revenue split (publisher/platform)
- **Verified Publishers** — Admin-controlled verification badges for trusted publishers
- **Wallet Integration** — Local encrypted wallet with Coinbase Onramp
- **Free & Paid Agents** — Flexible pricing models
- **Simple Agents** — Submit prompt-based agents without MCP endpoints

---

## User Flow

### Step 1: Install the CLI
```bash
npm install -g @agentstore/cli
```

### Step 2: Setup the Gateway
```bash
agentstore gateway-setup

# Restart Claude Code to load the gateway
```

### Step 3: Browse the Marketplace
```bash
agentstore browse
```

### Step 4: Install an Agent
```bash
# Free agents - install immediately
agentstore install techgangboss.wallet-assistant

# Paid agents - triggers x402 payment flow
agentstore install publisher.paid-agent --pay
```

**Paid Agent Flow:**
1. API returns `402 Payment Required` with USDC amount
2. CLI creates wallet (if needed) and prompts for permit signature
3. User signs ERC-2612 permit (gasless, no ETH needed)
4. Permit submitted to facilitator for execution
5. Facilitator transfers USDC (80% publisher, 20% platform)
6. API verifies payment and grants entitlement
7. Agent installed with routes and skill files

### Step 5: Use the Agent
Tools available immediately in Claude Code via the gateway MCP server.

---

## For Publishers

### Web Portal (Recommended)

The easiest way to publish agents is through the web portal at [agentstore.tools/submit](https://agentstore.tools/submit):

1. **Fill out the form** — Agent name, description, type, pricing, and tags
2. **Sign in with Google** — Creates your publisher account automatically
3. **Agent goes live** — Published immediately to the marketplace
4. **Track on dashboard** — View agents, sales, and earnings at [agentstore.tools/dashboard](https://agentstore.tools/dashboard)

**Simple agents** (no MCP endpoint required) work great for prompt-based agents. You can add MCP configuration later from the dashboard.

**Paid agents** require selecting "Proprietary" type and setting a price ($5 minimum). You earn 80% of every sale.

### CLI (Advanced)

For programmatic submissions with full manifest control:

```bash
# 1. Generate manifest template
agentstore publisher init

# 2. Edit manifest with your agent details
vim my-agent.json

# 3. Submit to marketplace
agentstore publisher submit my-agent.json
```

See the [Publisher Documentation](docs/PUBLISHER.md) for full manifest schema details.

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

## x402 Payment Protocol

AgentStore uses gasless USDC payments on Ethereum mainnet:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Gasless Payment Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User requests paid agent                                    │
│                    ↓                                            │
│  2. API returns 402 with: amount, recipient, fee_split, nonce   │
│                    ↓                                            │
│  3. User signs ERC-2612 permit (gasless signature)              │
│                    ↓                                            │
│  4. Permit sent to x402 Facilitator                             │
│                    ↓                                            │
│  5. Facilitator executes:                                       │
│     - permit(user, facilitator, amount)                         │
│     - transferFrom(user, platform, 20%)                         │
│     - transferFrom(user, publisher, 80%)                        │
│                    ↓                                            │
│  6. Facilitator returns proof to API                            │
│                    ↓                                            │
│  7. API grants entitlement, user gets agent                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Why gasless?**
- Users only need USDC, no ETH for gas
- Single signature UX (no approve + transfer)
- Facilitator pays gas, recoups from platform fee

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
└── pending_payments/  # Permits awaiting facilitator

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

# x402 Facilitator (when deployed)
X402_FACILITATOR_ENDPOINT=https://...           # Submit permits
X402_FACILITATOR_VERIFY_ENDPOINT=https://...    # Verify payments
```

### Web (Vercel)
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
VITE_API_URL=https://api-inky-seven.vercel.app
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agents` | GET | List all published agents (search, filter by tag/type) |
| `/api/agents/[id]` | GET | Get agent details with full manifest |
| `/api/agents/[id]/access` | GET | Check access, returns 402 if payment needed |
| `/api/payments/submit` | POST | Submit signed permit for payment |
| `/api/auth/link-publisher` | POST | Create publisher account (Google OAuth) |
| `/api/publishers/me` | GET/PATCH | Publisher profile and settings |
| `/api/publishers/agents/simple` | POST | Submit agent via web form (Google auth) |
| `/api/publishers` | POST | Register publisher (CLI, wallet signature) |
| `/api/publishers/agents` | POST | Submit agent (CLI, wallet signature) |
| `/api/admin/publishers/[id]/verify` | POST | Toggle publisher verification (admin only) |

---

## Remaining Work

### High Priority
| Task | Description |
|------|-------------|
| **x402 Facilitator** | Smart contract + API to execute permits and split payments |

### Medium Priority
| Task | Description |
|------|-------------|
| **Hosted Execution** | Serverless runtime for publisher tools (no self-hosting required) |
| E2E Tests | Automated testing with testnet USDC |

### Low Priority
| Task | Description |
|------|-------------|
| Subscription Billing | Recurring USDC payments |
| Usage-Based Billing | Per-call metering |

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
# Install CLI
npm install -g @agentstore/cli

# Setup gateway
agentstore gateway-setup

# Restart Claude Code

# Browse marketplace
agentstore browse

# Install your first agent
agentstore install techgangboss.wallet-assistant
```

---

## Deployment

- **Website**: https://agentstore.tools
- **CLI**: `npm install -g @agentstore/cli`
- **API**: Vercel (`https://api-inky-seven.vercel.app`)
- **Database**: Supabase (PostgreSQL with RLS)
- **Auth**: Google OAuth via Supabase Auth
- **Facilitator**: Pending deployment on Ethereum mainnet

## Security

- AES-256-GCM wallet encryption with OS keychain
- ERC-2612 permits (gasless, no private key exposure)
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
