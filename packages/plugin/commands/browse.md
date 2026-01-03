---
description: Browse the AgentStore marketplace for Claude Code plugins
arguments:
  - name: query
    description: Search query (optional)
    required: false
  - name: category
    description: Filter by category (optional)
    required: false
---

# Browse AgentStore Marketplace

Search and browse available agents in the AgentStore marketplace.

## Instructions

1. Fetch the agent catalog from the AgentStore API
2. If a search query is provided, filter results
3. Display agents in a formatted list showing:
   - Agent name and description
   - Publisher
   - Price (free or USDC amount)
   - Category/tags
4. Offer to show details for any agent using `/agent-info`

## API Endpoint

```
GET https://api.agentstore.dev/v1/agents
Query params: ?q={query}&category={category}&limit=20
```

## Display Format

For each agent, show:
```
{name} by {publisher}
{description}
Price: {price} | Tags: {tags}
---
```
