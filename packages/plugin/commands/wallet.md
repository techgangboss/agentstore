---
description: Manage your AgentStore wallet for x402 payments
arguments:
  - name: action
    description: "Action: status, setup, fund, history, limits"
    required: false
---

# AgentStore Wallet

Manage your local wallet for x402 payments on Base network.

## Instructions

Based on the action parameter (default: status):

### status
1. Check if wallet exists at `~/.agentstore/wallet.json`
2. If exists, display:
   ```
   ## AgentStore Wallet

   **Address:** 0x...
   **Network:** Base (Chain ID: 8453)
   **USDC Balance:** $X.XX

   **Spend Limits:**
   - Per transaction: $50.00
   - Daily: $100.00 (remaining: $X.XX)
   - Weekly: $500.00 (remaining: $X.XX)
   ```
3. If no wallet: "No wallet configured. Run `/wallet setup` to create one."

### setup
1. Ask user: "Create a new wallet or import existing?"
2. For new wallet:
   - Generate new keypair using viem
   - Encrypt private key with password
   - Save to `~/.agentstore/wallet.json`
   - Display address and backup seed phrase warning
3. For import:
   - Prompt for private key or seed phrase
   - Encrypt and save
4. Set default spend limits

### fund
1. Display wallet address for deposits
2. Show QR code if possible
3. Provide link to Coinbase for purchasing USDC on Base:
   ```
   To add funds:
   1. Send USDC (Base network) to: 0x...
   2. Or use Coinbase: https://www.coinbase.com/

   Minimum recommended: $10.00 USDC
   ```

### history
1. Read transaction history from local storage
2. Display recent purchases:
   ```
   ## Transaction History

   | Date | Agent | Amount | Status |
   |------|-------|--------|--------|
   | Jan 3 | SQL Expert | $5.00 | Confirmed |
   ```

### limits
1. Display current spend limits
2. Ask if user wants to modify:
   - Per-transaction limit (default $50)
   - Daily limit (default $100)
   - Weekly limit (default $500)
3. Save updated limits

## Files

```
~/.agentstore/
  wallet.json      # Encrypted wallet config
  history.json     # Transaction history
  entitlements/    # Stored entitlement tokens
```

## Security Notes

- Private key encrypted with AES-256-GCM
- Never transmitted over network
- Spend limits enforced client-side before signing
