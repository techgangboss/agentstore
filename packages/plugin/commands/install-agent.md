---
description: Install an agent from the AgentStore marketplace
arguments:
  - name: agent_id
    description: The agent ID to install (e.g., techgangboss.code-reviewer.1.0.0)
    required: true
---

# Install Agent from AgentStore

Purchase and install a paid or free agent from the AgentStore marketplace.

## Instructions

1. Fetch agent details from the API:
   ```
   GET https://api-inky-seven.vercel.app/api/agents/{agent_id}
   ```

2. Display agent info and ask for confirmation:
   ```
   ## Installing: {name} v{version}

   **Publisher:** {publisher.display_name}
   **Type:** {Open Source | Proprietary}
   **Price:** {FREE | $X.XX}

   **Description:**
   {description}

   **Permissions Required:**
   - Tools: {manifest.permissions.tools}
   - Network: {manifest.permissions.network}

   Proceed with installation? (y/n)
   ```

3. For FREE agents (type: "open"):
   - Create agent skill file in `.claude/skills/agentstore/`
   - Add to local agent registry

4. For PAID agents (type: "proprietary"):
   - Check if wallet is set up: `/wallet status`
   - If no wallet, prompt: "Run `/wallet setup` first"
   - Check balance covers price
   - If insufficient: "Add funds with `/wallet fund`"
   - Execute purchase via API
   - Store entitlement token securely

5. Create the agent skill file at `.claude/skills/agentstore/{agent_id}.md`:
   ```markdown
   ---
   description: {agent description}
   ---

   # {agent name}

   This agent is provided by {publisher} via AgentStore.

   ## Capabilities
   {from manifest}

   ## Usage
   Invoke this agent's tools: {tool list}
   ```

6. Confirm installation:
   ```
   Installed {name} v{version}

   Use the agent by asking Claude to use its capabilities,
   or run `/my-agents` to see all installed agents.
   ```

## API Endpoints

```
GET https://api-inky-seven.vercel.app/api/agents/{agent_id}
POST https://api-inky-seven.vercel.app/api/purchase
  Body: { agent_id, wallet_address, payment_signature }
  Returns: { entitlement_token, expires_at }
```
