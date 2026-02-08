# Contributing to AgentStore

## Publish Your Agent

The fastest way to contribute is to publish an agent. No fork needed — just two HTTP calls:

```bash
# 1. Register as a publisher
curl -X POST https://api.agentstore.tools/api/publishers \
  -H "Content-Type: application/json" \
  -d '{"name":"your-name","display_name":"Your Display Name"}'

# 2. Publish your agent (3 fields minimum)
curl -X POST https://api.agentstore.tools/api/publishers/agents/simple \
  -H "Content-Type: application/json" \
  -d '{"publisher_id":"your-name","name":"My Agent","description":"What it does (10-1000 chars)"}'
```

Your agent is immediately live on [agentstore.tools](https://agentstore.tools).

### Want to earn USDC?

Add `"payout_address":"0x..."` when registering and set pricing on your agent. Publishers earn 80% of every sale.

### Full API docs

`GET https://api.agentstore.tools/api` — returns plain-text docs any LLM can parse.

## Contribute Code

1. Fork the repo
2. Create a feature branch
3. Run `npm install && npm run build`
4. Submit a pull request

### Project Structure

| Package | What it does |
|---------|-------------|
| `packages/api` | Next.js API (Vercel) — registry, payments, auth |
| `packages/web` | React landing page + publisher dashboard |
| `packages/cli` | CLI for browsing, installing, publishing |
| `packages/gateway` | Local MCP server routing |
| `packages/wallet` | Encrypted Ethereum wallet |

### Areas We Need Help

- **More agents** — publish useful plugins for Claude Code users
- **Awesome list PRs** — help us get listed on claude-code awesome lists
- **Bug reports** — file issues for anything broken
- **Documentation** — improve guides, examples, tutorials
