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
  -n your-name \
  -d "Your Display Name"

# 4. Create an agent manifest
node packages/cli/dist/index.js publisher init -o my-agent.json

# 5. Edit the manifest and submit
node packages/cli/dist/index.js publisher submit my-agent.json
```

Your agent is immediately live in the marketplace.

---

## Agent Types

### 1. Prompt-Based Agents (No Server Required)

Most agents don't need a backend. They're just instructions that enhance Claude's capabilities:

```json
{
  "agent_id": "your-id.writing-coach",
  "name": "Writing Coach",
  "type": "open",
  "description": "Expert writing feedback and editing suggestions",
  "version": "1.0.0",
  "pricing": {
    "model": "free",
    "amount": 0,
    "currency": "USD"
  },
  "install": {
    "agent_wrapper": {
      "format": "markdown",
      "content": "You are an expert writing coach. When reviewing text:\n1. Check for clarity and conciseness\n2. Suggest stronger word choices\n3. Identify structural improvements\n4. Maintain the author's voice"
    }
  },
  "tags": ["Writing", "Productivity"]
}
```

**Use cases:**
- Specialized personas (writing coach, code reviewer, etc.)
- Domain expertise (legal, medical, financial guidance)
- Workflow templates (PR reviews, documentation)
- Custom instructions and prompts

### 2. Tool-Based Agents (External API Required)

For agents that need to fetch data or perform actions, you'll provide an MCP endpoint:

```json
{
  "agent_id": "your-id.weather-tool",
  "name": "Weather Assistant",
  "type": "proprietary",
  "description": "Real-time weather data for any location",
  "version": "1.0.0",
  "pricing": {
    "model": "one_time",
    "amount": 2,
    "currency": "USD"
  },
  "install": {
    "gateway_routes": [
      {
        "route_id": "default",
        "mcp_endpoint": "https://your-api.com/mcp",
        "tools": [
          {
            "name": "get_weather",
            "description": "Get current weather for a location",
            "inputSchema": {
              "type": "object",
              "properties": {
                "location": {
                  "type": "string",
                  "description": "City name or coordinates"
                }
              },
              "required": ["location"]
            }
          }
        ],
        "auth": {
          "type": "entitlement"
        }
      }
    ]
  },
  "tags": ["Weather", "Data"]
}
```

**Use cases:**
- External API integrations
- Database queries
- Web scraping
- Custom computations

---

## Manifest Format

### Required Fields

| Field | Description |
|-------|-------------|
| `agent_id` | Format: `publisher-id.agent-name` (lowercase, hyphens allowed) |
| `name` | Display name (1-100 characters) |
| `type` | `open` (free/open source) or `proprietary` (paid) |
| `description` | What your agent does (10-1000 characters) |
| `version` | Semantic version (e.g., `1.0.0`) |
| `pricing.model` | `free`, `one_time`, `subscription`, or `usage_based` |
| `pricing.amount` | Price in USD (0 for free agents) |

### Optional Fields

| Field | Description |
|-------|-------------|
| `install.agent_wrapper` | Prompt/instructions for the agent |
| `install.gateway_routes` | MCP endpoints with tools (if needed) |
| `permissions` | Required capabilities (network, filesystem) |
| `tags` | Categories for discoverability |

---

## Pricing Models

### Free Agent
```json
{
  "type": "open",
  "pricing": {
    "model": "free",
    "amount": 0
  }
}
```

### Paid Agent (One-Time Purchase)
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

**Revenue Split:**
- Publisher receives **80%**
- Platform fee: **20%**

---

## Payouts

- Payments are in USDC on Ethereum mainnet
- Sent directly to your registered wallet address
- 80/20 split (you get 80%)

### Check Your Payout Address
```bash
node packages/cli/dist/index.js wallet address
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

## Best Practices

1. **Clear descriptions** - Explain what your agent does in plain language
2. **Start simple** - Prompt-based agents are easier to build and maintain
3. **Good schemas** - Document all tool parameters with descriptions
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
