---
description: Uninstall an agent from AgentStore
arguments:
  - name: agent_id
    description: The agent ID to uninstall (e.g., acme.research-agent)
    required: true
---

# Uninstall Agent

Remove an installed agent from your local AgentStore configuration.

## Instructions

1. Read `~/.agentstore/routes.json`
2. Find and remove all entries matching the agent_id
3. Write updated routes back to file
4. Read `~/.agentstore/entitlements.json`
5. Find and remove entitlement for this agent
6. Write updated entitlements back to file
7. Remove skill file from `.claude/skills/agentstore/{agent_id}.md`

## Confirmation Flow

```
## Uninstalling: {agent_id}

This will remove:
- {N} gateway routes
- {N} tools: {tool_list}
- Entitlement token (if any)
- Local skill file

Note: This does NOT refund any payments. Entitlements remain valid
on the marketplace if you reinstall later.

Proceed? (y/n)
```

## After Uninstall

```
✓ Uninstalled {agent_id}

Removed:
- {N} tools from gateway
- Entitlement token
- Skill file

The agent's tools are no longer available. You can reinstall
anytime with `/install-agent {agent_id}`.
```

## If Agent Not Found

```
Agent "{agent_id}" is not installed.

Run `/my-agents` to see installed agents.
```

## Notes

- Uninstalling a paid agent does NOT revoke your entitlement on the server
- If you reinstall later, you won't need to pay again (entitlement is tied to wallet)
- Free agents can be reinstalled anytime
