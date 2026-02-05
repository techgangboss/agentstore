# AgentStore - Claude Code Plugin Marketplace

## Project Overview

AgentStore is an open-source marketplace for Claude Code plugins with gasless USDC payments via the x402 protocol.

**One-liner:** Browse, pay, and install MCP-backed agents directly in Claude Code with gasless USDC payments.

## Current Status: MVP Ready

### Completed
- [x] Marketplace API (browse, search, agent details)
- [x] CLI (install, uninstall, browse, list, wallet, publisher)
- [x] Gateway MCP server (tool routing, auth injection)
- [x] Local wallet (AES-256-GCM encryption, OS keychain)
- [x] Coinbase Onramp integration (fiat to crypto)
- [x] x402 payment protocol types and interfaces
- [x] 402 Payment Required API flow
- [x] EIP-3009 transferWithAuthorization signing
- [x] x402 facilitator integration (relay API)
- [x] Publisher registration and agent submission
- [x] 20% platform fee (80/20 split with publishers)
- [x] Publisher verification system (admin-controlled badges)
- [x] Landing page (https://agentstore.tools)
- [x] Publisher portal with Google OAuth
- [x] Publisher dashboard

### Not Started
- [ ] **Hosted Execution** - Serverless runtime so publishers don't need to host MCP endpoints
- [ ] Automated tests
- [ ] npm publish

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     x402 Payment Flow (EIP-3009)                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  User                  CLI                   API         Facilitator│
│   │                     │                     │               │     │
│   │ install agent       │                     │               │     │
│   │────────────────────>│                     │               │     │
│   │                     │ GET /access         │               │     │
│   │                     │────────────────────>│               │     │
│   │                     │                     │               │     │
│   │                     │<── 402 {amount,     │               │     │
│   │                     │     payTo, x402}    │               │     │
│   │                     │                     │               │     │
│   │ Sign authorization? │                     │               │     │
│   │<────────────────────│                     │               │     │
│   │ (user approves)     │                     │               │     │
│   │────────────────────>│                     │               │     │
│   │                     │                     │               │     │
│   │                     │ POST /payments/submit               │     │
│   │                     │────────────────────>│               │     │
│   │                     │                     │ /verify       │     │
│   │                     │                     │──────────────>│     │
│   │                     │                     │ /settle       │     │
│   │                     │                     │──────────────>│     │
│   │                     │                     │               │     │
│   │                     │                     │<─ {proof} ────│     │
│   │                     │                     │               │     │
│   │                     │<── {entitlement,    │               │     │
│   │                     │     install}        │               │     │
│   │                     │                     │               │     │
│   │ Installed!          │                     │               │     │
│   │<────────────────────│                     │               │     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Files

### Payment Protocol
- `packages/common/src/x402.ts` - Payment types, EIP-3009 authorization types, helpers
- `packages/api/src/app/api/agents/[agent_id]/access/route.ts` - Returns 402 for paid agents
- `packages/api/src/app/api/payments/submit/route.ts` - Accept signed authorizations, forward to facilitator

### Infrastructure
- `packages/cli/src/index.ts` - CLI commands
- `packages/gateway/src/index.ts` - MCP server routing
- `packages/wallet/src/index.ts` - Local wallet management

### Configuration
- `~/.agentstore/routes.json` - Installed agent routes
- `~/.agentstore/entitlements.json` - Access tokens
- `~/.agentstore/wallet.json` - Wallet config
- `~/.claude/mcp.json` - Gateway MCP registration

## Environment Variables

### API (Vercel)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
CDP_CLIENT_KEY=xxx                        # Coinbase Onramp

# x402 Facilitator (relay API for gasless payments)
X402_FACILITATOR_ENDPOINT=https://...     # /verify and /settle endpoints
```

## Payment Flow (x402 + EIP-3009)

The facilitator is a relay API (not a smart contract):
1. Server returns 402 with price, payTo address, and x402 config
2. User signs `transferWithAuthorization` (EIP-3009 typed data via EIP-712)
3. Signed authorization sent to server → forwarded to facilitator /verify then /settle
4. Facilitator's relay wallet submits the authorization to USDC on-chain, paying gas
5. USDC verifies the user's signature and moves funds directly from user to payTo address

**Key points:**
- Users only need USDC, no ETH for gas
- Single signature UX (one EIP-712 typed data message)
- Relay wallet pays gas, recoups from platform fee

## Next Steps

### Priority 1: E2E Testing
- Integration tests for payment flows
- Agent installation and publisher submission tests

### Priority 2: Dashboard Analytics
- Earnings charts, sales history
- Payout tracking

### Priority 3: Publisher Tools
- Edit agents from dashboard
- Revenue analytics

## Development

```bash
# Install and build
npm install && npm run build

# Run CLI
node packages/cli/dist/index.js browse
node packages/cli/dist/index.js install techgangboss.wallet-assistant

# Setup gateway
node packages/cli/dist/index.js gateway-setup
```

## Database

Supabase project: `pqjntpkfdcfsvnnjkbny`

Tables:
- `publishers` - Publisher profiles and payout addresses
- `agents` - Agent listings with manifests
- `entitlements` - Access tokens for paid agents
- `transactions` - Payment records
- `pending_payments` - Authorizations awaiting settlement
