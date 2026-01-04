---
description: |
  Use this skill when the user asks to find, search for, or discover Claude Code agents,
  plugins, or extensions. Trigger on phrases like "find an agent for", "is there a plugin that",
  "search marketplace", "agent for SQL", "plugin for code review", etc.
---

# AgentStore Marketplace Search

Search the AgentStore marketplace for Claude Code agents.

## When to Use

- User asks about finding agents/plugins
- User describes a capability they want ("I need something that can...")
- User mentions specific agent categories (database, code review, testing, etc.)

## Instructions

1. Extract the search intent from the user's message
2. Call the AgentStore API:
   ```
   GET https://api-inky-seven.vercel.app/api/agents?search={query}
   ```
3. Present matching agents with key details
4. Offer to install if user shows interest

## Example Interactions

**User:** "Is there an agent that can help me write SQL?"

**Response:**
Found 1 agent matching "SQL":

### SQL Expert v1.0.0
by TechGang Boss | Proprietary
Expert SQL agent that writes optimized queries and explains execution plans.
**Price:** $5.00 | **Tags:** database, productivity

Would you like to install it? Run `/install-agent techgangboss.sql-expert.1.0.0`

---

**User:** "Find me a free code review agent"

**Response:**
Found 1 free agent matching "code review":

### Code Reviewer v1.0.0
by TechGang Boss | Open Source
AI-powered code review agent that analyzes your code for bugs and security issues.
**Price:** FREE | **Tags:** code-quality, productivity

Would you like to install it? Run `/install-agent techgangboss.code-reviewer.1.0.0`
