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

   **MCP Tools Provided:**
   {list tools from manifest.install.gateway_routes[].tools}

   Proceed with installation? (y/n)
   ```

3. For FREE agents (type: "open"):
   - Skip to step 5 (no payment needed)

4. For PAID agents (type: "proprietary"):
   - Check if wallet is set up: `/wallet status`
   - If no wallet, prompt: "Run `/wallet setup` first"
   - Check balance covers price
   - If insufficient: "Add funds with `/wallet fund`"
   - Execute purchase via API:
     ```
     POST https://api-inky-seven.vercel.app/api/purchase
     Body: { agent_id, wallet_address, tx_hash }
     ```
   - API returns: `{ entitlement_token, expires_at, install }`

5. **Configure Gateway Routes** (critical for tools to work):

   Read existing `~/.agentstore/routes.json` or create empty array `[]`.

   For each route in `manifest.install.gateway_routes`, append:
   ```json
   {
     "agentId": "{agent_id}",
     "routeId": "{route.route_id}",
     "mcpEndpoint": "{route.mcp_endpoint}",
     "tools": [
       {
         "name": "{tool.name}",
         "description": "{tool.description}",
         "inputSchema": {tool.inputSchema}
       }
     ],
     "authType": "{route.auth.type}"
   }
   ```

   Write updated array back to `~/.agentstore/routes.json`.

6. **Store Entitlement Token** (for paid agents):

   Read existing `~/.agentstore/entitlements.json` or create empty array `[]`.

   Append the new entitlement:
   ```json
   {
     "agentId": "{agent_id}",
     "token": "{entitlement_token from API response}",
     "expiresAt": "{expires_at or null for lifetime}"
   }
   ```

   Write updated array back to `~/.agentstore/entitlements.json`.

7. Create the agent skill file at `.claude/skills/agentstore/{agent_id}.md`:
   ```markdown
   ---
   description: {agent description}
   ---

   # {agent name}

   This agent is provided by {publisher} via AgentStore.

   ## Capabilities
   {from manifest}

   ## Available Tools
   These tools are available via the AgentStore gateway MCP server:
   {list each tool with name and description}

   ## Usage
   Simply ask Claude to use these tools by name. The gateway handles
   routing and authentication automatically.
   ```

8. Confirm installation:
   ```
   ✓ Installed {name} v{version}

   Gateway configured with {N} tools:
   - {agent_id}:{tool_name_1}
   - {agent_id}:{tool_name_2}

   Use these tools by asking Claude, or run `/my-agents` to see all installed agents.
   ```

## File Locations

```
~/.agentstore/
├── routes.json        # Gateway routing config (tool definitions + MCP endpoints)
├── entitlements.json  # Auth tokens for paid agents
├── wallet.json        # Wallet config
└── wallet.keystore    # Encrypted private key
```

## API Endpoints

```
GET https://api-inky-seven.vercel.app/api/agents/{agent_id}
  Returns: { agent_id, name, type, manifest, publisher, ... }

POST https://api-inky-seven.vercel.app/api/purchase
  Body: { agent_id, wallet_address, tx_hash }
  Returns: { entitlement_token, expires_at, install, confirmation_status }
```

## Example Gateway Route Entry

After installing `acme.research-agent`:
```json
{
  "agentId": "acme.research-agent",
  "routeId": "default",
  "mcpEndpoint": "https://mcp.acme.com/research",
  "tools": [
    {
      "name": "search_papers",
      "description": "Search academic papers by topic",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": { "type": "string" },
          "limit": { "type": "number" }
        },
        "required": ["query"]
      }
    }
  ],
  "authType": "entitlement"
}
```

The gateway will expose this as `acme.research-agent:search_papers` to Claude.
