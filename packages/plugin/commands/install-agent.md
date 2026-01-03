---
description: Install an agent from the AgentStore marketplace
arguments:
  - name: agent_id
    description: The agent ID to install (e.g., publisher.agent-name)
    required: true
---

# Install Agent from AgentStore

Purchase and install a paid or free agent from the AgentStore marketplace.

## Instructions

1. Fetch agent details from the API
2. Display agent info and confirm with user:
   - Name, description, version
   - Publisher
   - Price and payment method
   - Required permissions
3. If paid agent:
   - Check local wallet balance
   - If insufficient, prompt to add funds
   - Execute x402 payment flow
   - Receive entitlement token
4. Download and install agent:
   - Fetch agent wrapper markdown
   - Configure gateway route for MCP endpoint
   - Store entitlement securely (if paid)
5. Update CLAUDE.md with installed agent info

## API Endpoints

```
GET https://api.agentstore.dev/v1/agents/{agent_id}
POST https://api.agentstore.dev/v1/purchase
  Body: { agent_id, payment_proof }
  Returns: { entitlement_token, expires_at }
```

## Installation Checklist

- [ ] Verify agent manifest checksum
- [ ] Create gateway route config
- [ ] Store entitlement (encrypted)
- [ ] Update local agent registry
- [ ] Update CLAUDE.md
