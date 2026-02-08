---
description: Install an agent from the AgentStore marketplace
arguments:
  - name: agent_id
    description: The agent ID to install (e.g., techgangboss.wallet-assistant)
    required: true
---

# Install Agent from AgentStore

Install an agent from the AgentStore marketplace using the CLI.

## Instructions

Run the AgentStore CLI to install:

```bash
agentstore install {agent_id}
```

The CLI will:
1. Fetch agent details from the marketplace API
2. Display agent info (name, publisher, price, tools)
3. For FREE agents: Install immediately
4. For PAID agents: Prompt for wallet payment
5. Write gateway routes to `~/.agentstore/routes.json`
6. Create skill file in `~/.claude/skills/agentstore/`

## Example

```bash
# Install the free wallet assistant
agentstore install techgangboss.wallet-assistant

# Force reinstall/update
agentstore install techgangboss.wallet-assistant --yes
```

## Other CLI Commands

```bash
# List installed agents
agentstore list

# Uninstall an agent
agentstore uninstall {agent_id}

# Show configuration
agentstore config

# Setup gateway in Claude's mcp.json
agentstore gateway-setup
```

## File Locations

```
~/.agentstore/
├── routes.json        # Gateway routing config
├── entitlements.json  # Auth tokens for paid agents
├── wallet.json        # Wallet config
└── wallet.keystore    # Encrypted private key

~/.claude/
├── mcp.json           # Claude MCP server config
└── skills/agentstore/ # Installed agent skills
```
