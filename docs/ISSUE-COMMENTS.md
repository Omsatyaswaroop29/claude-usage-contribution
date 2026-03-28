# Post this comment on issue #33978

---

## Unified `claude usage` command — addressing #33978, #27915, and #7328

Hi — I'd like to contribute a unified implementation that combines usage analytics, rate-limit visibility, and MCP context budget tracking into a single `claude usage` command.

### Why combine them

All three issues share the same root problem: **zero visibility into what Claude Code consumes on your behalf.** A unified observability surface is more coherent than three separate additions — and it closes **23+ duplicate issues with 50+ combined upvotes** in one shot.

### What I've built

**Core modules** (2,100+ lines TypeScript, 45 tests passing):

| Module | What it does |
|---|---|
| `UsageParser` | Stream-parses JSONL transcripts from `~/.claude/projects/`. Memory-efficient readline, malformed-line resilience, date/model/project filtering |
| `UsageAggregator` | Incremental metrics: token totals (with cache breakdown), cost, per-model/project/day rollups, session counting, cache hit rate |
| `RateLimitCollector` | Parses `anthropic-ratelimit-*` headers + unified-status JSON. Exposes `rate_limits` object for statusLine |
| `MCPIntrospector` | Estimates per-tool context window cost via `tools/list` analysis. Aggregates per-server + total budget |
| `TerminalFormatter` | Pretty CLI output with bar charts, color, JSON mode |
| `UsageCommand` | CLI handler with `--project`, `--since/until`, `--model`, `--json`, `--verbose`, `--rate-limit`, `--mcp-breakdown` |

### Proposed CLI interface

```bash
claude usage                          # Summary for current period
claude usage --rate-limit             # Current API rate-limit status
claude usage --mcp-breakdown          # Per-tool context budget
claude usage --watch                  # Live-updating display
claude usage --json                   # Machine-readable output
claude usage --project my-app --since 2025-03-01
```

### Interactive demo

I built an interactive demo showing the exact output format for each subcommand:

> **[Live demo](https://omsatyaswaroop29.github.io/claude-usage-contribution/demo/)**

*(Click the tabs to see each command mode with typing animation and animated bar charts)*

### PR strategy

I'll submit **4 incremental, independently mergeable PRs**:

1. **Parser + Aggregator + basic `claude usage`** → closes #33978
2. **CLI flags** (`--watch`, `--project`, `--model`, `--json`)
3. **RateLimitCollector + statusLine extension** → closes #27915
4. **MCPIntrospector + `--mcp-breakdown`** → contributes to #7328

### Technical decisions

- **Zero new dependencies** — Node.js built-ins only (readline, fs). Token estimation uses character-based heuristic (~4 chars/token) to avoid importing tiktoken
- **Streaming architecture** — parser processes line-by-line, never loads full files into memory
- **Backward compatible** — reads existing JSONL format, no schema changes required
- **Conventional commits** — `feat(usage):`, `test(usage):`, matching the repo's patterns

The code is ready. Happy to adjust the approach based on feedback before opening PR 1.

Related: #27915, #7328, #20636, #23512, #6057

---

# Post this shorter comment on issue #27915

---

Hi — I'm working on a unified `claude usage` command that addresses this alongside #33978 and #7328. The rate-limit piece:

- `RateLimitCollector` parses `anthropic-ratelimit-*` headers and the unified-status JSON blob
- Extends statusLine JSON with: `{ rate_limits: { session_usage_pct, daily_usage_pct, requests_remaining, tokens_remaining, reset_at, plan } }`
- Also exposed via `claude usage --rate-limit` for on-demand snapshots

Full proposal with architecture details and interactive demo on [#33978](https://github.com/anthropics/claude-code/issues/33978). Would welcome feedback on the statusLine schema.

---

# Post this shorter comment on issue #7328

---

Hi @anthropics/claude-code team — I see this has maintainer interest. I'm building a unified observability layer (proposal on [#33978](https://github.com/anthropics/claude-code/issues/33978)) and one piece is **MCP context budget visibility**: estimating per-tool token cost and surfacing it via `claude usage --mcp-breakdown` and in statusLine JSON.

This is the *visibility* side of the filtering problem — data that makes filtering decisions informed. Happy to coordinate scope if a contribution here is welcome.
