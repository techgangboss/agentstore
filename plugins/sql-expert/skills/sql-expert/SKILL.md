---
description: |
  Use this skill when the user needs help writing SQL queries, optimizing existing queries,
  understanding execution plans, designing schemas, or debugging database issues. Trigger on
  phrases like "write a query", "optimize this SQL", "explain this query", "design a schema",
  "database help", "why is this query slow", etc.
---

# SQL Expert

Write optimized SQL queries and explain execution plans. Supports PostgreSQL, MySQL, and SQLite.

## Capabilities

- Write complex SQL queries from natural language descriptions
- Optimize slow queries with index and structure suggestions
- Explain execution plans in plain English
- Design normalized database schemas
- Debug query errors and suggest fixes
- Generate migrations for schema changes

## Instructions

### Writing Queries

When the user describes what data they need:

1. Ask clarifying questions if the schema is unclear
2. Check for existing schema files (`.sql`, migrations, ORM models) in the project
3. Write the query with:
   - Clear aliases and formatting
   - Appropriate JOINs (prefer explicit JOIN syntax over implicit)
   - WHERE clauses with proper indexing considerations
   - LIMIT for potentially large result sets
4. Explain what the query does and any assumptions made

### Optimizing Queries

When the user shares a slow query:

1. Analyze the query structure
2. Check for common performance issues:
   - Missing indexes on JOIN/WHERE columns
   - SELECT * when only specific columns needed
   - Correlated subqueries that could be JOINs
   - Missing LIMIT on large tables
   - Unnecessary ORDER BY on unindexed columns
   - N+1 query patterns in application code
3. Suggest specific improvements with before/after
4. Recommend indexes to create: `CREATE INDEX idx_name ON table(column);`

### Explaining Execution Plans

When the user shares an EXPLAIN output:

1. Walk through each step of the plan
2. Identify the most expensive operations
3. Flag sequential scans on large tables
4. Explain estimated vs actual rows discrepancies
5. Suggest indexes or query restructuring to improve the plan

### Schema Design

When the user needs a new schema:

1. Identify entities and relationships
2. Apply normalization (typically 3NF for OLTP)
3. Choose appropriate data types (prefer specific types: `timestamptz` over `text`)
4. Add primary keys, foreign keys, and constraints
5. Suggest indexes for expected query patterns
6. Generate CREATE TABLE statements
7. Generate a migration file if the project uses migrations

## Dialect Awareness

Detect the database dialect from:
- Project dependencies (pg, mysql2, better-sqlite3, prisma, drizzle, etc.)
- Existing migration files
- User specification

Adjust syntax accordingly:
- **PostgreSQL:** Use `SERIAL`/`GENERATED`, `jsonb`, `timestamptz`, CTEs, window functions
- **MySQL:** Use `AUTO_INCREMENT`, `JSON`, `DATETIME`, appropriate engine (InnoDB)
- **SQLite:** Use `INTEGER PRIMARY KEY` for auto-increment, note limited ALTER TABLE

## Example

**User:** "Write a query to get all users who signed up in the last 30 days with their order count"

```sql
SELECT
  u.id,
  u.email,
  u.created_at,
  COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.created_at >= NOW() - INTERVAL '30 days'
GROUP BY u.id, u.email, u.created_at
ORDER BY u.created_at DESC;
```

This uses a LEFT JOIN so users with zero orders are still included. The GROUP BY aggregates orders per user. Consider adding an index on `users(created_at)` if this query runs frequently.
