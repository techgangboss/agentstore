---
description: List your installed AgentStore agents
---

# My Installed Agents

Display all agents installed from the AgentStore marketplace.

## Instructions

1. Check for agent skill files in `.claude/skills/agentstore/`
2. Read the local registry at `~/.agentstore/agents.json`
3. For each installed agent, display info from registry

## Display Format

```
## My Installed Agents ({count})

### {name} v{version}
**Publisher:** {publisher}
**Type:** {Open Source | Proprietary}
**Installed:** {install_date}
**Status:** {Active | Expired on date}

---
```

## Example Output

```
## My Installed Agents (2)

### Code Reviewer v1.0.0
**Publisher:** TechGang Boss
**Type:** Open Source
**Installed:** Jan 3, 2026
**Status:** Active (free agent)

---

### SQL Expert v1.0.0
**Publisher:** TechGang Boss
**Type:** Proprietary
**Installed:** Jan 3, 2026
**Status:** Active (expires: never)

---

Commands:
- `/browse` - Find more agents
- `/install-agent {id}` - Install or update an agent
```

## If No Agents Installed

```
## My Installed Agents (0)

No agents installed yet.

Get started:
1. Run `/browse` to explore the marketplace
2. Run `/install-agent {agent_id}` to install

Popular agents:
- techgangboss.code-reviewer.1.0.0 (FREE)
- techgangboss.sql-expert.1.0.0 ($5.00)
```

## Registry Location

```
~/.agentstore/agents.json
```

Format:
```json
{
  "agents": [
    {
      "agent_id": "techgangboss.code-reviewer.1.0.0",
      "installed_at": "2026-01-03T12:00:00Z",
      "entitlement_token": null,
      "expires_at": null
    }
  ]
}
```
