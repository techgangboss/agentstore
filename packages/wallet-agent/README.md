# Wallet Assistant Agent

A free AgentStore agent that provides insights into your local wallet.

## Features

- **get_balance** - Check ETH balance in wei, ETH, and USD
- **get_transactions** - View transaction history with filtering
- **get_spending_stats** - Analyze daily/weekly spending vs limits
- **get_wallet_config** - View wallet settings and allowed publishers
- **get_eth_price** - Get current ETH/USD price

## Installation

This agent is available in the AgentStore marketplace:

```bash
/install-agent techgangboss.wallet-assistant
```

## Running Locally

### As stdio MCP server (for direct Claude integration)

```bash
cd packages/wallet-agent
npm install
npm run build
npm start
```

Add to your `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "wallet-assistant": {
      "command": "node",
      "args": ["/path/to/agentstore/packages/wallet-agent/dist/index.js"]
    }
  }
}
```

### As HTTP server (for gateway integration)

```bash
npm run build
node dist/http-server.js
```

This starts an HTTP server on port 3456 that the AgentStore gateway can proxy to.

## Development

```bash
# Run with hot reload
npm run dev

# Build
npm run build
```

## Data Sources

Reads from `~/.agentstore/`:
- `wallet.json` - Wallet configuration
- `tx_history.json` - Transaction history

Fetches ETH price from CoinGecko API.

## License

MIT
