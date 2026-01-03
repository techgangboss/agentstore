---
description: List your installed AgentStore agents
---

# My Installed Agents

Display all agents installed from the AgentStore marketplace.

## Instructions

1. Read the local agent registry (~/.agentstore/agents.json)
2. For each installed agent, display:
   - Agent name and version
   - Publisher
   - Install date
   - Entitlement status (active/expired)
   - Last used date
3. Show total count and any pending updates

## Display Format

```
Installed Agents ({count})
========================

{name} v{version}
  Publisher: {publisher}
  Installed: {install_date}
  Status: {active|expired}
  Last used: {last_used}
---
```

## Actions

Offer these actions:
- Update agent: `/install-agent {agent_id}` (reinstall)
- Remove agent: `/remove-agent {agent_id}`
- View details: `/agent-info {agent_id}`
