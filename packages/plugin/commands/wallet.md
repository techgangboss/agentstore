---
description: Manage your AgentStore wallet
arguments:
  - name: action
    description: "Action: balance, add-funds, history, settings"
    required: false
---

# AgentStore Wallet

Manage your local wallet for x402 payments.

## Instructions

Based on the action parameter:

### balance (default)
1. Read wallet from ~/.agentstore/wallet.json
2. Display:
   - Wallet address
   - USDC balance
   - Network (Base mainnet)
   - Spend limits remaining

### add-funds
1. Generate a deposit QR code/address
2. Or initiate Coinbase Onramp flow (opens browser)
3. Monitor for incoming transaction
4. Update balance when confirmed

### history
1. List recent transactions
2. Show: date, agent, amount, status

### settings
1. Display/update spend controls:
   - Per-transaction limit
   - Daily limit
   - Weekly limit
   - Allowed publishers (allowlist)

## Wallet Location

```
~/.agentstore/wallet.json (encrypted)
~/.agentstore/wallet.keystore
```

## Security

- Private key never leaves local machine
- Encrypted at rest with OS keychain
- Spend limits enforced locally
