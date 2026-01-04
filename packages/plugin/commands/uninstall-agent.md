---
description: Uninstall an agent from AgentStore
arguments:
  - name: agent_id
    description: The agent ID to uninstall (e.g., techgangboss.wallet-assistant)
    required: true
---

# Uninstall Agent

Remove an installed agent using the CLI.

## Instructions

Run the AgentStore CLI:

```bash
node /Users/zion/agentstore/packages/cli/dist/index.js uninstall {agent_id}
```

This will:
1. Remove gateway routes from `~/.agentstore/routes.json`
2. Remove entitlement from `~/.agentstore/entitlements.json` (if any)
3. Delete skill file from `~/.claude/skills/agentstore/`

## Example

```bash
node /Users/zion/agentstore/packages/cli/dist/index.js uninstall techgangboss.wallet-assistant
```

Output:
```
  ✓ Removed routes from /Users/zion/.agentstore/routes.json
  ✓ Removed skill file: /Users/zion/.claude/skills/agentstore/techgangboss-wallet-assistant.md

✅ Uninstalled: techgangboss.wallet-assistant
```

## Notes

- Uninstalling a paid agent does NOT revoke your entitlement on the server
- If you reinstall later, you won't need to pay again (entitlement is tied to wallet)
- Free agents can be reinstalled anytime
