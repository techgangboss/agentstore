# AgentStore - Claude Code Plugin Marketplace

## Project Overview

AgentStore is an open-source marketplace for Claude Code plugins with gasless USDC payments via the x402 protocol.

**One-liner:** The marketplace where agents and developers discover, install, and sell Claude Code plugins with stablecoin payouts and ranking rewards.

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

### Earn Program
- `packages/api/src/app/api/cron/earn-distribution/route.ts` - Monthly cron: computes distributions + checks on-chain payouts
- `packages/api/src/app/api/earn-program/route.ts` - Public leaderboard and program info
- `packages/api/src/app/api/publishers/me/earn-program/route.ts` - Authenticated publisher earn stats
- `packages/web/src/components/EarnProgram.tsx` - Landing page earn section with live leaderboard
- `packages/web/src/components/publisher/EarnProgramCard.tsx` - Dashboard earn card with progress bar

### Infrastructure
- `packages/cli/src/index.ts` - CLI commands (x402 USDC payment flow)
- `packages/gateway/src/index.ts` - MCP server routing

### Configuration
- `~/.agentstore/routes.json` - Installed agent routes
- `~/.agentstore/entitlements.json` - Access tokens
- `~/.agentstore/wallet.json` - Wallet config
- `~/.claude/mcp.json` - Gateway MCP registration

## Environment Variables

### API (Vercel)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
CDP_CLIENT_KEY=xxx                        # Coinbase Onramp

# x402 Facilitator (relay API for gasless payments)
X402_FACILITATOR_ENDPOINT=https://facilitator.primev.xyz     # /verify and /settle endpoints
```

## Payment Flow (x402 + EIP-3009)

The facilitator is a relay API (not a smart contract):
1. Server returns 402 with price, payTo address, and x402 config
2. User signs `transferWithAuthorization` (EIP-3009 typed data via EIP-712)
3. Signed authorization sent to server -> forwarded to facilitator /verify then /settle
4. Facilitator's relay wallet submits the authorization to USDC on-chain, paying gas
5. USDC verifies the user's signature and moves funds directly from user to payTo address

**Key points:**
- Users only need USDC, no ETH for gas
- Single signature UX (one EIP-712 typed data message)
- Relay wallet pays gas, recoups from platform fee

## Development

```bash
# Install and build
npm install && npm run build

# Run CLI
agentstore browse
agentstore install techgangboss.wallet-assistant

# Setup gateway
agentstore gateway-setup
```

## Database

Uses Supabase (PostgreSQL with RLS).

Tables:
- `publishers` - Publisher profiles and payout addresses
- `agents` - Agent listings with manifests
- `entitlements` - Access tokens for paid agents
- `transactions` - Payment records
- `pending_payments` - Authorizations awaiting settlement
- `earn_distributions` - Monthly earn pool cycles (period, pool amount, status)
- `earn_distribution_shares` - Per-publisher shares (rank, earn_amount, payout_status, payout_tx_hash)
