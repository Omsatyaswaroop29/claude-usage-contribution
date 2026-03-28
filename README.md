# `claude usage` — Unified Observability for Claude Code

> **Proposed feature** combining [#33978](https://github.com/anthropics/claude-code/issues/33978) (usage analytics), [#27915](https://github.com/anthropics/claude-code/issues/27915) (rate-limit visibility), and [#7328](https://github.com/anthropics/claude-code/issues/7328) (MCP context budget) into a single CLI command. Closes **23+ duplicate issues** with **50+ combined upvotes**.

**[Try the Interactive Demo](https://omsatyaswaroop29.github.io/claude-usage-contribution/demo/)** · [Roadmap](docs/ROADMAP.md)

---

## Demo

> **[Click here for the full interactive demo with animated terminal + pixel mascot](https://omsatyaswaroop29.github.io/claude-usage-contribution/demo/)**

### `claude usage` — usage summary

```
~ claude usage

Claude Code Usage Summary (Mar 1 - Mar 28, 2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Sessions:     47
  Total cost:   $12.34
  Avg/session:  $0.26

  Tokens
    Input:      1,234,567  (cache hit: 78%)
    Output:       456,789

  By model
    sonnet-4          $8.21  (66%)  │████████████████████░░░░░░░░░░│
    opus-4            $4.13  (34%)  │██████████░░░░░░░░░░░░░░░░░░░░│

  Top projects
    my-app            $5.67  │████████████████░░░░░░░░░░░░░░│
    backend           $3.89  │███████████░░░░░░░░░░░░░░░░░░░│
    scripts           $2.78  │████████░░░░░░░░░░░░░░░░░░░░░░│
```

### `claude usage --rate-limit` — are you about to hit a cap?

```
~ claude usage --rate-limit

Rate Limits
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Session usage:  72.5%  [■■■■■■■■■■■■■■·····] !
  Daily usage:    45.0%  [■■■■■■■■■···········]

  Requests left:  847
  Tokens left:    1,234,567
  Resets at:      2026-03-29T00:00:00Z
  Plan:           Pro
```

### `claude usage --mcp-breakdown` — where is your context window going?

```
~ claude usage --mcp-breakdown

MCP Context Budget
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Total MCP context: 34,521 tokens (17.3% of 200k window)

  Server: playwright
    Tools: 12          Cost: 8,234 tokens
    ├─ browser_click           1,200 tokens
    ├─ browser_navigate        1,100 tokens
    └─ browser_screenshot        980 tokens

  Server: github
    Tools: 8           Cost: 4,567 tokens
    ├─ create_pull_request     1,800 tokens
    └─ search_code             1,200 tokens

  Server: filesystem
    Tools: 5           Cost: 2,100 tokens
```

### `claude usage --watch` — real-time monitoring

```
~ claude usage --watch

  ● LIVE ─ refreshing every 2s

  Session tokens:  12,456 in / 3,891 out
  Session cost:    $0.47
  Duration:        4m 23s

  Rate limit:     72.5%  [■■■■■■■■■■■■■■·····] !
  Context used:   34.2%  [■■■■■■■·············]

  Active model:   claude-sonnet-4
  MCP overhead:   34,521 tokens (17.3%)

  Press q to quit, r to reset counters
```

### `claude usage --json` — pipe it anywhere

```json
~ claude usage --json

{
  "summary": {
    "sessions": 47,
    "total_cost_usd": 12.34,
    "cache_hit_rate_pct": 78.1
  },
  "rate_limits": {
    "session_usage_pct": 72.5,
    "daily_usage_pct": 45.0,
    "tokens_remaining": 1234567
  },
  "mcp_context": {
    "total_tokens": 34521,
    "usage_pct": 17.3
  }
}
```

---

## The problem

Claude Code users have zero visibility into what they're consuming — no token counts, no cost tracking, no rate-limit awareness, and no understanding of which MCP tools eat their context window. This is the single most requested feature category in the repo, with 10+ duplicate issues filed independently.

## The solution

A single `claude usage` command that answers three questions at once:

```bash
claude usage                          # What am I spending?
claude usage --rate-limit             # Am I about to hit a cap?
claude usage --mcp-breakdown          # Where is my context window going?
```

### All subcommands

| Command | What it shows |
|---|---|
| `claude usage` | Token totals, cost, cache hit rate, per-model and per-project breakdowns |
| `claude usage --rate-limit` | Session/daily usage %, requests remaining, reset time, plan |
| `claude usage --mcp-breakdown` | Per-server and per-tool context window token cost |
| `claude usage --watch` | Live-updating display during active session |
| `claude usage --json` | Machine-readable output for scripting and CI/CD |
| `claude usage --project my-app` | Filter by project |
| `claude usage --since 2025-03-01` | Filter by date range |
| `claude usage --model sonnet` | Filter by model |
| `claude usage --verbose` | Per-day breakdown table |

---

## Architecture

```
DATA SOURCES                              OUTPUT SURFACES
────────────                              ───────────────
~/.claude/projects/**/*.jsonl ──┐         ┌── claude usage        (CLI summary)
anthropic-ratelimit-* headers ──┼── Agg ──┼── statusLine JSON     (live HUD)
.mcp.json + tools/list ────────┘         └── --mcp-breakdown     (context budget)
```

### Modules

| Module | Lines | What it does |
|---|---|---|
| **UsageParser** | 120 | Stream-parses JSONL transcripts. Memory-efficient readline, malformed-line resilience, date/model/project filtering |
| **UsageAggregator** | 150 | Incremental metrics: token totals (with cache breakdown), cost, per-model/project/day rollups, cache hit rate |
| **RateLimitCollector** | 130 | Parses `anthropic-ratelimit-*` headers + unified-status JSON. Produces `rate_limits` object for statusLine |
| **MCPIntrospector** | 150 | Estimates per-tool context window cost via tools/list analysis. Aggregates per-server and total budget |
| **TerminalFormatter** | 130 | Pretty CLI output with bar charts, ANSI color, JSON mode |
| **UsageCommand** | 120 | CLI entry point. Argument parsing, routing to sub-handlers, filter construction |

---

## Test suite

**45 tests, all passing.** Zero dependencies — uses Node's built-in `assert` module.

```bash
npm install
npx tsx src/__tests__/run-tests.ts
```

```
parseJSONLString
  ✓ should parse valid JSONL into records
  ✓ should skip lines without usage data
  ✓ should handle empty input
  ✓ should skip malformed lines without throwing

UsageParser.parseFile
  ✓ should parse valid JSONL file and yield only usage records
  ✓ should enrich records with sessionId from filename
  ✓ should extract cost and token data correctly
  ✓ should skip malformed lines and continue parsing
  ✓ should filter by model
  ✓ should filter by date range
  ✓ should handle non-existent file gracefully

UsageAggregator
  ✓ should compute correct token totals
  ✓ should compute correct cost totals
  ✓ should count unique sessions
  ✓ should compute cache hit rate
  ✓ should compute average session cost
  ✓ should break down by model
  ✓ should break down by day
  ✓ should handle empty input
  ... (27 more)

═══════════════════════════════════════════════════════
  45/45 tests passed  ✓ all passing
═══════════════════════════════════════════════════════
```

Coverage includes: parser edge cases (malformed JSONL, empty files, missing fields), aggregation math (cache hit rate, cost totals, session counting), rate-limit header parsing (standard headers, unified-status JSON, malformed input), MCP token estimation, CLI argument parsing, and end-to-end command execution.

---

## Technical decisions

| Decision | Rationale |
|---|---|
| **Zero new dependencies** | Uses only Node.js built-ins (`readline`, `fs`, `path`). No tiktoken — token estimation uses character-based heuristic (~4 chars/token), accurate within ~10% |
| **Streaming architecture** | Parser processes JSONL line-by-line via `readline`. Never loads full files into memory |
| **Backward compatible** | Reads existing JSONL transcript format at `~/.claude/projects/`. No schema changes required |
| **Incremental aggregation** | Aggregator processes records one at a time with running totals. Supports early termination |
| **Conventional commits** | Follows `feat(usage):`, `test(usage):` matching the repo's existing patterns |

---

## PR strategy

Four incremental, independently mergeable PRs:

| PR | Contents | Closes |
|---|---|---|
| **PR 1** | UsageParser + UsageAggregator + TerminalFormatter + `claude usage` command | #33978 |
| **PR 2** | `--watch` mode, `--project`/`--model`/`--since`/`--until` filters | Enhances #33978 |
| **PR 3** | RateLimitCollector + statusLine `rate_limits` extension | #27915 |
| **PR 4** | MCPIntrospector + `--mcp-breakdown` + statusLine `mcp_context_*` | #7328 |

---

## Project structure

```
claude-usage-contribution/
├── demo/
│   └── index.html                  ← Interactive demo with pixel mascot
├── docs/
│   └── ROADMAP.md                  ← Phase breakdown
├── src/
│   ├── types.ts                    ← Shared type definitions
│   ├── usage-parser.ts             ← JSONL stream parser
│   ├── usage-aggregator.ts         ← Metrics computation + formatters
│   ├── rate-limit-collector.ts     ← API header parsing
│   ├── mcp-introspector.ts         ← Context budget analysis
│   ├── index.ts                    ← Module exports
│   ├── commands/
│   │   └── usage.ts                ← CLI command handler + arg parser
│   ├── formatters/
│   │   └── terminal.ts             ← Pretty terminal output
│   └── __tests__/
│       ├── run-tests.ts            ← 45-test suite
│       └── fixtures/
│           ├── sample-session.jsonl
│           └── malformed-session.jsonl
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## Related issues

This contribution addresses or relates to:

- [#33978](https://github.com/anthropics/claude-code/issues/33978) — Built-in usage analytics command (consolidates 10+ open issues)
- [#27915](https://github.com/anthropics/claude-code/issues/27915) — Expose rate-limit / plan quota usage in statusLine JSON (13 duplicates, 50+ upvotes)
- [#7328](https://github.com/anthropics/claude-code/issues/7328) — MCP tool filtering: selective enable/disable of individual tools
- [#20636](https://github.com/anthropics/claude-code/issues/20636) — Usage visibility (31 upvotes alone)
- [#23512](https://github.com/anthropics/claude-code/issues/23512), [#6057](https://github.com/anthropics/claude-code/issues/6057) — Related auth/visibility requests

---

## Author

**Om Satya Swaroop** — MS Information Systems, Northeastern University
ML Engineer building production infrastructure for AI systems.

- GitHub: [@Omsatyaswaroop29](https://github.com/Omsatyaswaroop29)
- Claude Code fork: [Omsatyaswaroop29/claude-code](https://github.com/Omsatyaswaroop29/claude-code)
