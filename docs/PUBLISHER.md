# AgentStore Publisher Guide

Publish your agents to AgentStore and earn USDC when users purchase them.

## Quick Start

```bash
# 1. Install the CLI
cd agentstore && npm install && npm run build

# 2. Create a wallet (stores your payout address)
node packages/cli/dist/index.js wallet setup

# 3. Register as a publisher
node packages/cli/dist/index.js publisher register \
  -i your-publisher-id \
  -n "Your Display Name"

# 4. Create an agent manifest
node packages/cli/dist/index.js publisher init -o my-agent.json

# 5. Edit the manifest and submit
node packages/cli/dist/index.js publisher submit my-agent.json
```

Your agent is immediately live in the marketplace.

---

## Agent Manifest Format

```json
{
  "agent_id": "your-publisher-id.agent-name",
  "name": "Your Agent Name",
  "type": "open",
  "description": "A clear description of what your agent does (10-1000 chars)",
  "version": "1.0.0",
  "pricing": {
    "model": "free",
    "amount": 0,
    "currency": "USD"
  },
  "install": {
    "agent_wrapper": {
      "format": "markdown",
      "entrypoint": "agent.md"
    },
    "gateway_routes": [
      {
        "route_id": "default",
        "mcp_endpoint": "https://your-server.com/mcp",
        "tools": [
          {
            "name": "your_tool",
            "description": "What this tool does",
            "inputSchema": {
              "type": "object",
              "properties": {
                "param1": {
                  "type": "string",
                  "description": "Parameter description"
                }
              },
              "required": ["param1"]
            }
          }
        ],
        "auth": {
          "type": "none"
        }
      }
    ]
  },
  "permissions": {
    "requires_network": true,
    "requires_filesystem": false
  },
  "tags": ["Productivity", "Data"]
}
```

---

## Required Fields

| Field | Description |
|-------|-------------|
| `agent_id` | Format: `publisher-id.agent-name` (lowercase, hyphens allowed) |
| `name` | Display name (1-100 characters) |
| `type` | `open` (free, open source) or `proprietary` (paid) |
| `description` | What your agent does (10-1000 characters) |
| `version` | Semantic version (e.g., `1.0.0`) |
| `pricing.model` | `free`, `one_time`, `subscription`, or `usage_based` |
| `pricing.amount` | Price in USD (0 for free agents) |
| `install.gateway_routes` | Array of MCP endpoints with tools |

---

## Pricing Models

### Free Agent (`type: "open"`)
```json
{
  "type": "open",
  "pricing": {
    "model": "free",
    "amount": 0
  }
}
```
- Must use `auth.type: "none"` in routes
- Open source, no payment required

### Paid Agent (`type: "proprietary"`)
```json
{
  "type": "proprietary",
  "pricing": {
    "model": "one_time",
    "amount": 5,
    "currency": "USD"
  }
}
```
- Must use `auth.type: "entitlement"` in routes
- Users pay once, get permanent access
- You receive USDC to your payout address

---

## MCP Endpoint Setup

Your agent needs an MCP (Model Context Protocol) server that Claude Code can connect to.

### Endpoint Requirements
- HTTPS URL (required in production)
- Responds to MCP tool calls
- Returns JSON responses

### Auth Types

| Type | Description |
|------|-------------|
| `none` | No authentication (free agents) |
| `entitlement` | AgentStore verifies purchase before allowing access |
| `api_key` | Your own API key system |

### Example MCP Server (Node.js)
```javascript
import express from 'express';

const app = express();
app.use(express.json());

app.post('/mcp', (req, res) => {
  const { method, params } = req.body;

  if (method === 'your_tool') {
    // Handle tool call
    res.json({ result: 'Tool output' });
  }
});

app.listen(3000);
```

---

## Updating Your Agent

Submit the same `agent_id` with a new `version`:

```bash
# Edit my-agent.json, bump version to 1.0.1
node packages/cli/dist/index.js publisher submit my-agent.json
```

The marketplace automatically updates your listing.

---

## Payouts

- Payments are in USDC on Ethereum mainnet
- Sent directly to your registered payout address
- No platform fees during beta

### Check Your Payout Address
```bash
node packages/cli/dist/index.js wallet address
```

---

## Best Practices

1. **Clear descriptions** - Explain what your agent does in plain language
2. **Useful tools** - Each tool should have a clear purpose
3. **Good schemas** - Document all parameters with descriptions
4. **Semantic versioning** - Use proper version bumps (major.minor.patch)
5. **Appropriate pricing** - Price based on value provided

---

## CLI Reference

```bash
# Wallet
agentstore wallet setup          # Create wallet
agentstore wallet balance        # Check balance
agentstore wallet address        # Show address

# Publisher
agentstore publisher register    # Register as publisher
agentstore publisher info        # Show publisher info
agentstore publisher init        # Create manifest template
agentstore publisher submit      # Submit/update agent

# Testing
agentstore browse                # See your agent in marketplace
agentstore install <agent_id>    # Test installing your agent
```

---

## Support

- GitHub Issues: https://github.com/techgangboss/agentstore/issues
- Documentation: https://agentstore.tools/docs (coming soon)
