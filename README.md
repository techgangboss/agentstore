# AgentStore

An open-source marketplace for Claude Code plugins with gasless USDC payments.

**One-line:** Users browse, pay, and install MCP-backed agents directly from Claude Code — with gasless USDC payments via the x402 protocol.

## Project Status: 75% Complete

| Category | Status | Notes |
|----------|--------|-------|
| Core Infrastructure | ✅ Complete | API, CLI, Gateway |
| Payment Protocol | ✅ Designed | x402 types, 402 flow, permits |
| x402 Facilitator | ⏳ Pending | Contract needed for gasless payments |
| Landing Page | ⏳ Pending | agentstore.dev |
| **Overall** | **MVP Ready** | Facilitator unlocks payments |

---

## User Flow

### Step 1: Install the Plugin
```bash
# Clone and build (until npm publish)
git clone https://github.com/techgangboss/agentstore.git
cd agentstore && npm install && npm run build

# Setup gateway in Claude Code
node packages/cli/dist/index.js gateway-setup

# Restart Claude Code to load the gateway
```

### Step 2: Browse the Marketplace
```bash
node packages/cli/dist/index.js browse
```

### Step 3: Install an Agent
```bash
# Free agents - install immediately
node packages/cli/dist/index.js install techgangboss.wallet-assistant

# Paid agents - triggers x402 payment flow
node packages/cli/dist/index.js install publisher.paid-agent --pay
```

**Paid Agent Flow:**
1. API returns `402 Payment Required` with USDC amount
2. CLI creates wallet (if needed) and prompts for permit signature
3. User signs ERC-2612 permit (gasless, no ETH needed)
4. Permit submitted to facilitator for execution
5. Facilitator transfers USDC and returns proof
6. API verifies payment and grants entitlement
7. Agent installed with routes and skill files

### Step 4: Use the Agent
Tools available immediately in Claude Code via the gateway MCP server.

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
│  2. API returns 402 with: amount, recipient, nonce              │
│                    ↓                                            │
│  3. User signs ERC-2612 permit (gasless signature)              │
│                    ↓                                            │
│  4. Permit sent to x402 Facilitator                             │
│                    ↓                                            │
│  5. Facilitator executes:                                       │
│     - permit(user, facilitator, amount)                         │
│     - transferFrom(user, publisher, amount)                     │
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
- Facilitator pays gas, optionally recoups from payment

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
```

## Packages

| Package | Description |
|---------|-------------|
| `packages/api` | Next.js API on Vercel. Agent registry, 402 flow, payment verification. |
| `packages/cli` | CLI for browsing, installing, and managing agents. |
| `packages/gateway` | Local MCP server routing tool calls to publishers. |
| `packages/wallet` | Local Ethereum wallet with encryption. |
| `packages/common` | Shared types including x402 payment protocol. |
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

---

## Remaining Work

### High Priority
| Task | Description |
|------|-------------|
| **x402 Facilitator** | Smart contract + API to execute permits and transfer USDC |
| **Landing Page** | agentstore.dev with "Add to Claude Code" button |

### Medium Priority
| Task | Description |
|------|-------------|
| Publisher Dashboard | Web UI for agent management and analytics |
| npm Publish | `npm install -g @agentstore/cli` |
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
    "currency": "USDC"
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
            "inputSchema": { "type": "object" }
          }
        ],
        "auth": { "type": "none | entitlement" }
      }
    ]
  }
}
```

---

## Quick Start

```bash
# Clone and build
git clone https://github.com/techgangboss/agentstore.git
cd agentstore && npm install && npm run build

# Browse marketplace
node packages/cli/dist/index.js browse

# Install free agent
node packages/cli/dist/index.js install techgangboss.wallet-assistant

# Setup gateway
node packages/cli/dist/index.js gateway-setup

# Restart Claude Code
```

---

## Deployment

- **API**: Vercel (`https://api-inky-seven.vercel.app`)
- **Database**: Supabase (`pqjntpkfdcfsvnnjkbny`)
- **Facilitator**: Pending deployment on Ethereum mainnet

## Security

- AES-256-GCM wallet encryption with OS keychain
- ERC-2612 permits (gasless, no private key exposure)
- Row-level security on all database tables
- Input validation via Zod schemas
- HTTPS enforcement in production

---

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run `npm run build`
4. Submit a pull request

For facilitator development or partnership inquiries, open an issue.
