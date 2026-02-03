# AgentStore - Claude Code Plugin Marketplace

## Project Overview

AgentStore is an open-source marketplace for Claude Code plugins with gasless USDC payments via the x402 protocol.

**One-liner:** Browse, pay, and install MCP-backed agents directly in Claude Code with gasless USDC payments.

## Current Status: 75% Complete

### Completed
- [x] Marketplace API (browse, search, agent details)
- [x] CLI (install, uninstall, browse, list, wallet)
- [x] Gateway MCP server (tool routing, auth injection)
- [x] Local wallet (AES-256-GCM encryption, OS keychain)
- [x] Coinbase Onramp integration (fiat to crypto)
- [x] x402 payment protocol types and interfaces
- [x] 402 Payment Required API flow
- [x] Permit signing infrastructure (ERC-2612)
- [x] Facilitator-ready payment abstraction

### In Progress / Blocked
- [ ] **x402 Facilitator Contract** - Executes USDC transfers from signed permits
- [ ] Landing page with plugin install button

### Not Started
- [ ] Publisher dashboard
- [ ] Automated tests
- [ ] npm publish

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         x402 Payment Flow                           │
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
│   │                     │     recipient,      │               │     │
│   │                     │     nonce}          │               │     │
│   │                     │                     │               │     │
│   │ Sign permit?        │                     │               │     │
│   │<────────────────────│                     │               │     │
│   │ (user approves)     │                     │               │     │
│   │────────────────────>│                     │               │     │
│   │                     │                     │               │     │
│   │                     │ POST /payments/submit               │     │
│   │                     │────────────────────>│               │     │
│   │                     │                     │ POST /execute │     │
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
- `packages/common/src/x402.ts` - Payment types, permit signatures, helpers
- `packages/api/src/app/api/agents/[agent_id]/access/route.ts` - Returns 402 for paid agents
- `packages/api/src/app/api/payments/submit/route.ts` - Accept signed permits

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

# Future - when facilitator is deployed
X402_FACILITATOR_ENDPOINT=https://...     # Submit permits
X402_FACILITATOR_VERIFY_ENDPOINT=https://...  # Verify payments
```

## Next Steps

### Priority 1: x402 Facilitator
The facilitator contract enables gasless USDC payments:
1. Receives signed ERC-2612 permits
2. Calls `permit()` on USDC contract
3. Executes `transferFrom()` to publisher
4. Returns proof to marketplace API

**Why facilitator is needed:**
- Users don't need ETH for gas
- Single signature UX (no approve + transfer)
- Marketplace can verify payments via facilitator API

### Priority 2: Landing Page
Simple page at agentstore.dev:
- Explain what AgentStore is
- "Add to Claude Code" button
- Featured agents showcase

### Priority 3: Publisher Tools
- Web dashboard for agent management
- Revenue analytics
- Payout configuration

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
- `pending_payments` - Permits awaiting facilitator processing
