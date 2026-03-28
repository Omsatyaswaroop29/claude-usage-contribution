# Issue Comment Templates

Copy-paste these directly into the GitHub issue comment boxes.

---

## Comment for #33978 (main proposal)

Post at: https://github.com/anthropics/claude-code/issues/33978

---

## Unified `claude usage` command — addressing #33978, #27915, and #7328

Hi — I'd like to contribute a unified implementation that combines usage analytics, rate-limit visibility, and MCP context budget tracking into a single `claude usage` command. This closes **23+ duplicate issues with 50+ combined upvotes** in one shot.

### What I've built

2,100+ lines of TypeScript, 45 tests passing, zero new dependencies:

```bash
claude usage                      # Token totals, cost, cache hit rate, model/project breakdowns
claude usage --rate-limit         # Session/daily usage %, requests remaining, reset time
claude usage --mcp-breakdown      # Per-server and per-tool context window cost
claude usage --watch              # Live-updating display
claude usage --json               # Machine-readable output for CI/CD
```

**[Interactive demo](https://omsatyaswaroop29.github.io/claude-usage-contribution/demo/)** — click the tabs to see each command mode with typing animation and bar charts.

**[Full README with architecture, test output, and PR strategy](https://github.com/Omsatyaswaroop29/claude-usage-contribution)**

### Technical highlights

- **Streaming parser** — processes JSONL transcripts line-by-line via readline, never loads full files
- **Zero dependencies** — Node.js built-ins only. Token estimation uses ~4 chars/token heuristic
- **Backward compatible** — reads existing `~/.claude/projects/` JSONL format, no schema changes
- **statusLine extension** — adds `rate_limits` and `mcp_context_*` objects to the HUD payload

### PR strategy

4 incremental, independently mergeable PRs:
1. Parser + Aggregator + basic `claude usage` → closes #33978
2. CLI flags (`--watch`, `--project`, `--model`, `--json`)
3. RateLimitCollector + statusLine extension → closes #27915
4. MCPIntrospector + `--mcp-breakdown` → contributes to #7328

Code is ready. Happy to adjust based on feedback before opening PR 1.

Related: #27915, #7328, #20636, #23512, #6057

---

## Comment for #27915 (rate-limit)

Post at: https://github.com/anthropics/claude-code/issues/27915

---

Hi — I'm working on a unified `claude usage` command that addresses this alongside #33978 and #7328.

The rate-limit piece specifically:
- `RateLimitCollector` module that parses `anthropic-ratelimit-*` headers and the unified-status JSON blob
- Extends statusLine JSON with: `{ rate_limits: { session_usage_pct, daily_usage_pct, requests_remaining, tokens_remaining, reset_at, plan } }`
- Also exposed via `claude usage --rate-limit` for on-demand CLI snapshots

Full proposal with architecture, tests, and **[interactive demo](https://omsatyaswaroop29.github.io/claude-usage-contribution/demo/)** on [#33978](https://github.com/anthropics/claude-code/issues/33978). Code: [github.com/Omsatyaswaroop29/claude-usage-contribution](https://github.com/Omsatyaswaroop29/claude-usage-contribution)

Would welcome feedback on the statusLine schema before opening a PR.

---

## Comment for #7328 (MCP tool filtering)

Post at: https://github.com/anthropics/claude-code/issues/7328

---

Hi team — I'm building a unified observability layer ([proposal on #33978](https://github.com/anthropics/claude-code/issues/33978)) and one piece is **MCP context budget visibility**: estimating per-tool token cost and surfacing it via `claude usage --mcp-breakdown` and in statusLine JSON.

This is the *visibility* side of the filtering problem — data that makes filtering decisions informed. Example output:

```
MCP Context Budget
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Total MCP context: 34,521 tokens (17.3% of 200k window)

  Server: playwright
    Tools: 12          Cost: 8,234 tokens
    ├─ browser_click         1,200 tokens
    ├─ browser_navigate      1,100 tokens
    └─ browser_screenshot      980 tokens
```

**[Interactive demo](https://omsatyaswaroop29.github.io/claude-usage-contribution/demo/)** (click the "mcp" tab) · **[Code + README](https://github.com/Omsatyaswaroop29/claude-usage-contribution)**

Happy to coordinate scope if a contribution here is welcome.
