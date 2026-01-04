---
description: List your installed AgentStore agents
---

# My Installed Agents

Display all agents installed from the AgentStore marketplace.

## Instructions

1. Read gateway routes from `~/.agentstore/routes.json`
2. Read entitlements from `~/.agentstore/entitlements.json`
3. Group tools by agentId to get unique agents
4. Cross-reference with entitlements for expiration status
5. Check for agent skill files in `.claude/skills/agentstore/`

## Display Format

```
## My Installed Agents ({count})

### {agentId}
**Tools:** {count} tools available
**Auth:** {none | entitlement}
**Status:** {Active | Expired on date}

Available tools:
- {agentId}:{tool_name_1} - {description}
- {agentId}:{tool_name_2} - {description}

---
```

## Example Output

```
## My Installed Agents (2)

### acme.code-reviewer
**Tools:** 2 tools available
**Auth:** none (free agent)
**Status:** Active

Available tools:
- acme.code-reviewer:review_code - Review code for issues
- acme.code-reviewer:suggest_fixes - Suggest code improvements

---

### acme.research-agent
**Tools:** 3 tools available
**Auth:** entitlement
**Status:** Active (expires: never)

Available tools:
- acme.research-agent:search_papers - Search academic papers
- acme.research-agent:summarize - Summarize research findings
- acme.research-agent:cite - Generate citations

---

Commands:
- `/browse` - Find more agents
- `/install-agent {id}` - Install or update an agent
- `/wallet` - Manage wallet and spending
```

## If No Agents Installed

```
## My Installed Agents (0)

No agents installed yet.

Get started:
1. Run `/browse` to explore the marketplace
2. Run `/install-agent {agent_id}` to install

Popular agents:
- techgangboss.code-reviewer (FREE)
- techgangboss.sql-expert ($5.00)
```

## Config File Locations

```
~/.agentstore/
├── routes.json        # Gateway routing config
├── entitlements.json  # Auth tokens for paid agents
├── wallet.json        # Wallet config
└── wallet.keystore    # Encrypted private key
```

### routes.json format
```json
[
  {
    "agentId": "acme.research-agent",
    "routeId": "default",
    "mcpEndpoint": "https://mcp.acme.com/research",
    "tools": [
      { "name": "search_papers", "description": "...", "inputSchema": {...} }
    ],
    "authType": "entitlement"
  }
]
```

### entitlements.json format
```json
[
  {
    "agentId": "acme.research-agent",
    "token": "ent_abc123...",
    "expiresAt": null
  }
]
```
