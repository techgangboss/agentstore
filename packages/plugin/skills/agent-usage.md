---
description: |
  Use this skill when the user wants to use capabilities from an installed AgentStore agent.
  Check ~/.agentstore/agents.json for installed agents and route requests appropriately.
---

# Installed Agent Usage

Route user requests to installed AgentStore agents.

## When to Use

- User references capabilities that match an installed agent
- User explicitly mentions using an installed agent
- User asks to perform a task that an agent was installed for

## Instructions

1. Read installed agents from `~/.agentstore/agents.json`
2. Match user intent to agent capabilities
3. For proprietary agents:
   - Verify entitlement is active
   - Route to gateway with entitlement token
4. For open-source agents:
   - Use agent's embedded tools directly

## Example

If user has SQL Expert installed and asks "write a query to get all users":
1. Check that `techgangboss.sql-expert.1.0.0` is installed
2. Verify entitlement is active
3. Use the agent's capabilities to fulfill the request

## No Matching Agent

If no installed agent matches the request:
```
I don't have an agent installed for that capability.

Would you like to search the marketplace?
Run `/browse {search term}` to find relevant agents.
```
