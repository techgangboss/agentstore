# agentstore

Open-source marketplace CLI for Claude Code plugins. Browse, install, publish, and earn USDC.

## Install

**Native plugin** (recommended — no npm needed):

```
/plugin marketplace add techgangboss/agentstore
/plugin install code-reviewer@agentstore
```

**npm CLI** (adds wallet, payments, and publishing):

```bash
npm install -g agentstore
agentstore browse
agentstore install techgangboss.code-reviewer
```

## For Publishers

Earn 80% of every sale in USDC by publishing your Claude Code plugins.

```bash
# Create a wallet
agentstore wallet setup

# Register as a publisher
agentstore publisher register -n my-publisher -d "My Publisher"

# Create a manifest template
agentstore publisher init

# Edit the manifest with your agent details, then submit
agentstore publisher submit agent-manifest.json
```

Or skip the CLI entirely and use the API:

```bash
# Register (no auth needed)
curl -X POST https://api.agentstore.tools/api/publishers \
  -H "Content-Type: application/json" \
  -d '{"name":"my-publisher","display_name":"My Publisher"}'

# Publish a free agent (no auth needed)
curl -X POST https://api.agentstore.tools/api/publishers/agents/simple \
  -H "Content-Type: application/json" \
  -d '{"publisher_id":"my-publisher","name":"My Agent","description":"Does cool stuff","version":"1.0.0"}'
```

## Commands

| Command | Description |
|---------|-------------|
| `agentstore browse` | Browse marketplace agents |
| `agentstore install <agent>` | Install an agent |
| `agentstore uninstall <agent>` | Uninstall an agent |
| `agentstore list` | List installed agents |
| `agentstore config` | Show configuration |
| `agentstore gateway-setup` | Setup the MCP gateway |
| `agentstore wallet setup` | Create a local wallet |
| `agentstore wallet balance` | Check wallet balance |
| `agentstore wallet fund` | Fund wallet via Coinbase |
| `agentstore wallet history` | Transaction history |
| `agentstore publisher register` | Register as a publisher |
| `agentstore publisher init` | Create manifest template |
| `agentstore publisher submit` | Submit an agent |

## Payment

Paid agents use gasless USDC payments via the x402 protocol (EIP-3009). You only need USDC — no ETH for gas.

```bash
agentstore install publisher.paid-agent --pay
```

## Links

- Website: [agentstore.tools](https://agentstore.tools)
- API Docs: [api.agentstore.tools/api](https://api.agentstore.tools/api)
- GitHub: [github.com/techgangboss/agentstore](https://github.com/techgangboss/agentstore)

## License

MIT
