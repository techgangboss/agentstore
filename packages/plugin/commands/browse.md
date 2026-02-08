---
description: Browse the AgentStore marketplace for Claude Code plugins
arguments:
  - name: query
    description: Search query (optional)
    required: false
  - name: category
    description: Filter by category (e.g., productivity, database, code-quality)
    required: false
---

# Browse AgentStore Marketplace

Search and browse available agents in the AgentStore marketplace.

## Instructions

1. Use WebFetch to call the AgentStore API:
   ```
   GET https://api.agentstore.tools/api/agents
   ```
   Add query params if provided: `?search={query}&tag={category}`

2. Parse the JSON response and display agents in a clean format

3. For each agent show:
   - Name and version
   - Publisher name
   - Description (truncated to ~100 chars)
   - Type: "Open Source" or "Proprietary"
   - Price: "FREE" or "$X.XX"
   - Tags as badges

4. After listing, ask if user wants to:
   - See details for a specific agent
   - Install an agent with `/install-agent {agent_id}`
   - Filter by different category

## Display Format

```
## AgentStore Marketplace

### {name} v{version}
by {publisher} | {type}
{description}
**Price:** {FREE or $X.XX} | **Tags:** {tags}

---
```

## Example Output

```
## AgentStore Marketplace

### Code Reviewer v1.0.0
by TechGang Boss | Open Source
AI-powered code review agent that analyzes your code for bugs and security issues.
**Price:** FREE | **Tags:** code-quality, productivity

---

### SQL Expert v1.0.0
by TechGang Boss | Proprietary
Expert SQL agent that writes optimized queries and explains execution plans.
**Price:** $5.00 | **Tags:** database, productivity

---

Found 2 agents. Use `/install-agent {agent_id}` to install.
```
