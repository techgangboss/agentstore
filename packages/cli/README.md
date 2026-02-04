# @agentstore/cli

Browse, install, and pay for Claude Code agents from the [AgentStore](https://agentstore.tools) marketplace.

## Installation

```bash
npm install -g @agentstore/cli
```

## Quick Start

```bash
# Setup the gateway (one-time)
agentstore gateway-setup

# Restart Claude Code to activate the gateway

# Browse available agents
agentstore browse

# Install an agent
agentstore install techgangboss.wallet-assistant
```

## Commands

| Command | Description |
|---------|-------------|
| `agentstore browse` | Browse marketplace agents |
| `agentstore install <agent>` | Install an agent |
| `agentstore uninstall <agent>` | Uninstall an agent |
| `agentstore list` | List installed agents |
| `agentstore gateway-setup` | Setup the MCP gateway |
| `agentstore wallet setup` | Create a local wallet for payments |
| `agentstore wallet balance` | Check wallet balance |
| `agentstore publisher register` | Register as a publisher |
| `agentstore publisher submit <manifest>` | Submit an agent |

## Paid Agents

For paid agents, you'll need USDC on Ethereum mainnet:

```bash
# Setup wallet
agentstore wallet setup

# Fund wallet (opens Coinbase Onramp)
agentstore wallet fund

# Install paid agent
agentstore install publisher.paid-agent --pay
```

Payments use gasless ERC-2612 permits - you only need USDC, no ETH for gas.

## Links

- Website: https://agentstore.tools
- API: https://api.agentstore.dev
- GitHub: https://github.com/techgangboss/agentstore

## License

MIT
