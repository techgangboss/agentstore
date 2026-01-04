---
description: List your installed AgentStore agents
---

# My Installed Agents

List all agents installed from the AgentStore marketplace.

## Instructions

Run the AgentStore CLI:

```bash
node /Users/zion/agentstore/packages/cli/dist/index.js list
```

This shows all installed agents with their tools.

## Example Output

```
Installed Agents (2):

  techgangboss.wallet-assistant
    Tools: 5
    Auth: none
      • techgangboss.wallet-assistant:get_balance
      • techgangboss.wallet-assistant:get_transactions
      • techgangboss.wallet-assistant:get_spending_stats
      • techgangboss.wallet-assistant:get_wallet_config
      • techgangboss.wallet-assistant:get_eth_price

  acme.research-agent
    Tools: 3
    Auth: entitlement
      • acme.research-agent:search_papers
      • acme.research-agent:summarize
      • acme.research-agent:cite
```

## Related Commands

```bash
# Show config and gateway status
node /Users/zion/agentstore/packages/cli/dist/index.js config

# Uninstall an agent
node /Users/zion/agentstore/packages/cli/dist/index.js uninstall {agent_id}

# Install a new agent
node /Users/zion/agentstore/packages/cli/dist/index.js install {agent_id}
```
