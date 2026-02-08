---
description: |
  Use this skill when the user asks about their AgentStore wallet, USDC balance,
  transaction history, spending patterns, or wants to check payment status. Trigger on
  phrases like "check my balance", "wallet status", "transaction history", "how much
  have I spent", "payment history", etc.
---

# Wallet Assistant

Provides insights into your AgentStore wallet including balances, transaction history, and spending analysis.

## Capabilities

- Check ETH and USDC balances
- View transaction history with details
- Analyze spending patterns over time
- Check payment status for agent purchases
- Show earnings for publishers

## Instructions

### Check Balance

Read the wallet configuration from `~/.agentstore/wallet.json` to get the wallet address, then query balances:

1. Read `~/.agentstore/wallet.json` for the wallet address
2. Use the wallet address to check on-chain balances
3. Report ETH balance (for gas) and USDC balance (for agent purchases)

### Transaction History

Read entitlements and transaction records:

1. Check `~/.agentstore/entitlements.json` for purchased agents
2. List each purchase with: agent name, price paid, date, status
3. Calculate total spent

### Spending Analysis

When asked about spending patterns:

1. Group transactions by time period (weekly/monthly)
2. Group by category (agent tags)
3. Show most purchased categories
4. Calculate average transaction size

## Example Interactions

**User:** "What's my wallet balance?"

Check `~/.agentstore/wallet.json`, read the address, and report:
- Wallet address: 0x...
- USDC balance: $X.XX
- ETH balance: X.XXXX ETH

**User:** "Show my purchase history"

Check `~/.agentstore/entitlements.json` and list:
- Agent Name | Price | Date | Status
- Total spent: $X.XX across N purchases

**User:** "How much have I spent on agents this month?"

Filter transactions to current month and summarize spending.
