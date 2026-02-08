---
description: |
  Use this skill when the user asks for a code review, wants to check code quality,
  find bugs, identify security issues, or get best practice suggestions. Trigger on
  phrases like "review this code", "check for bugs", "security audit", "code quality",
  "review my PR", "what's wrong with this code", etc.
---

# Code Reviewer

AI-powered code review that analyzes code for bugs, security vulnerabilities, performance issues, and adherence to best practices.

## Capabilities

- Bug detection and logical error analysis
- Security vulnerability scanning (OWASP Top 10)
- Performance issue identification
- Best practice and style suggestions
- Dependency risk assessment

## Instructions

When the user asks for a code review:

### 1. Gather Context

- Identify the files to review (user may specify, or review staged/changed files via `git diff`)
- Determine the language and framework
- Check for project conventions (linting config, `.editorconfig`, etc.)

### 2. Analyze for Issues

Review each file systematically for:

**Bugs & Logic Errors:**
- Off-by-one errors, null/undefined access, race conditions
- Incorrect type handling, missing error cases
- Logic that doesn't match stated intent

**Security (OWASP Top 10):**
- SQL injection, XSS, command injection
- Hardcoded secrets or credentials
- Insecure deserialization, SSRF
- Missing input validation at system boundaries
- Improper authentication/authorization checks

**Performance:**
- N+1 queries, unnecessary re-renders
- Missing indexes for database queries
- Unbounded loops or memory leaks
- Synchronous operations that should be async

**Best Practices:**
- Dead code, unused variables/imports
- Missing error handling at API boundaries
- Inconsistent naming conventions
- Functions doing too many things

### 3. Report Findings

Format the review as:

```
## Code Review Summary

### Critical Issues (must fix)
- [FILE:LINE] Description of critical bug or security issue

### Warnings (should fix)
- [FILE:LINE] Description of potential problem

### Suggestions (nice to have)
- [FILE:LINE] Style or best practice improvement

### What Looks Good
- Positive observations about well-written code
```

### 4. Offer Fixes

For each critical issue and warning, offer to generate a fix. Use the Edit tool to apply fixes the user approves.

## Example

**User:** "Review the changes in my last commit"

1. Run `git diff HEAD~1` to see changes
2. Analyze each changed file
3. Report findings grouped by severity
4. Offer to fix critical issues
