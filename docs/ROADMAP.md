# `claude usage` — Unified Observability Layer for Claude Code

## The Problem

Claude Code users have **zero visibility** into what they're consuming — no token counts, no cost tracking, no rate-limit awareness, no understanding of which MCP tools eat their context window — and 10+ duplicate issues prove this is the single most requested feature category in the repo.

## What We're Building

A single `claude usage` CLI command that unifies three open issues:

| Issue | What it solves | Our contribution |
|---|---|---|
| [#33978](https://github.com/anthropics/claude-code/issues/33978) | No way to see token/cost history | `claude usage` summary + filters |
| [#27915](https://github.com/anthropics/claude-code/issues/27915) | No rate-limit data in statusLine | `rate_limits` object in statusLine JSON |
| [#7328](https://github.com/anthropics/claude-code/issues/7328) | No visibility into MCP tool context cost | `--mcp-breakdown` flag |

Combined, this closes 23+ duplicate issues with 50+ upvotes.

## Architecture

```
DATA SOURCES                          OUTPUT SURFACES
─────────────                         ───────────────
JSONL Transcripts ──┐                 ┌── claude usage (CLI)
API Headers ────────┼── Aggregator ───┼── statusLine JSON (HUD)
MCP Config ─────────┘                 └── --mcp-breakdown
```

## Phase Breakdown

### Phase 1: JSONL Parser + Aggregator (PR 1)
- UsageParser: stream JSONL, filter by date/model/project
- UsageAggregator: token totals, cost, cache hit rate, breakdowns
- TerminalFormatter: pretty output with bar charts
- CLI: `claude usage` with --since, --until, --project, --model, --json, --verbose

### Phase 2: Rate-Limit Exposure (PR 3)
- RateLimitCollector: parse anthropic-ratelimit-* headers
- Extend statusLine JSON with rate_limits object
- `claude usage --rate-limit` snapshot

### Phase 3: MCP Context Budget (PR 4)
- MCPIntrospector: estimate per-tool token cost
- `claude usage --mcp-breakdown` with tree view
- Add mcp_context_tokens to statusLine

## Tech Stack
- TypeScript, zero new dependencies
- Node.js built-ins (readline, fs) for streaming
- Character-based token estimation (~4 chars/token)
- Conventional commits matching repo patterns
