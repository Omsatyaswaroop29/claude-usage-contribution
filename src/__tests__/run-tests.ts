/**
 * Standalone test runner — verifies all modules compile and work correctly.
 * Uses Node's built-in assert module (no Jest dependency needed).
 *
 * Run: npx tsx src/__tests__/run-tests.ts
 */

import * as assert from "assert";
import * as path from "path";
import { UsageParser, parseJSONLString } from "../usage-parser";
import {
  UsageAggregator,
  formatTokenCount,
  formatCost,
  formatPct,
  barChart,
} from "../usage-aggregator";
import { RateLimitCollector } from "../rate-limit-collector";
import { MCPIntrospector } from "../mcp-introspector";
import { TerminalFormatter } from "../formatters/terminal";
import { UsageCommand, parseArgs } from "../commands/usage";
import { UsageRecord } from "../types";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) await result;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err: any) {
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    \x1b[2m${err.message}\x1b[0m`);
    failures.push(`${name}: ${err.message}`);
    failed++;
  }
}

function group(name: string) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

async function main() {

// ─── parseJSONLString ────────────────────────────────────────────────────────

group("parseJSONLString");

await test("should parse valid JSONL into records", () => {
  const input = [
    '{"type":"assistant","costUSD":0.01,"usage":{"input_tokens":100,"output_tokens":50}}',
    '{"type":"assistant","costUSD":0.02,"usage":{"input_tokens":200,"output_tokens":100}}',
  ].join("\n");
  const records = parseJSONLString(input);
  assert.strictEqual(records.length, 2);
  assert.strictEqual(records[0].costUSD, 0.01);
  assert.strictEqual(records[1].costUSD, 0.02);
});

await test("should skip lines without usage data", () => {
  const input = [
    '{"type":"user","message":{"content":"hello"}}',
    '{"type":"assistant","costUSD":0.01,"usage":{"input_tokens":100,"output_tokens":50}}',
  ].join("\n");
  const records = parseJSONLString(input);
  assert.strictEqual(records.length, 1);
});

await test("should handle empty input", () => {
  assert.deepStrictEqual(parseJSONLString(""), []);
  assert.deepStrictEqual(parseJSONLString("\n\n\n"), []);
});

await test("should skip malformed lines without throwing", () => {
  const input = [
    "not json",
    '{"type":"assistant","costUSD":0.01,"usage":{"input_tokens":100,"output_tokens":50}}',
    "{broken",
  ].join("\n");
  const records = parseJSONLString(input);
  assert.strictEqual(records.length, 1);
});

// ─── UsageParser.parseFile ───────────────────────────────────────────────────

group("UsageParser.parseFile");

await test("should parse valid JSONL file and yield only usage records", async () => {
  const parser = new UsageParser(FIXTURES_DIR);
  const filePath = path.join(FIXTURES_DIR, "sample-session.jsonl");
  const records: UsageRecord[] = [];
  for await (const record of parser.parseFile(filePath)) {
    records.push(record);
  }
  assert.strictEqual(records.length, 4);
});

await test("should enrich records with sessionId from filename", async () => {
  const parser = new UsageParser(FIXTURES_DIR);
  const filePath = path.join(FIXTURES_DIR, "sample-session.jsonl");
  const records: UsageRecord[] = [];
  for await (const record of parser.parseFile(filePath)) {
    records.push(record);
  }
  assert.strictEqual(records[0].sessionId, "sample-session");
});

await test("should extract cost and token data correctly", async () => {
  const parser = new UsageParser(FIXTURES_DIR);
  const filePath = path.join(FIXTURES_DIR, "sample-session.jsonl");
  const records: UsageRecord[] = [];
  for await (const record of parser.parseFile(filePath)) {
    records.push(record);
  }
  assert.strictEqual(records[0].costUSD, 0.0234);
  assert.strictEqual(records[0].usage?.input_tokens, 4521);
  assert.strictEqual(records[0].usage?.output_tokens, 892);
  assert.strictEqual(records[0].usage?.cache_read_input_tokens, 3200);
  assert.strictEqual(records[0].model, "claude-sonnet-4-20250514");
});

await test("should skip malformed lines and continue parsing", async () => {
  const parser = new UsageParser(FIXTURES_DIR);
  const filePath = path.join(FIXTURES_DIR, "malformed-session.jsonl");
  const records: UsageRecord[] = [];
  const origWarn = console.warn;
  console.warn = () => {};
  for await (const record of parser.parseFile(filePath)) {
    records.push(record);
  }
  console.warn = origWarn;
  assert.strictEqual(records.length, 4);
  const costs = records.map((r) => r.costUSD);
  assert.deepStrictEqual(costs, [0.01, 0.02, 0.03, 0.04]);
});

await test("should filter by model", async () => {
  const parser = new UsageParser(FIXTURES_DIR);
  const filePath = path.join(FIXTURES_DIR, "sample-session.jsonl");
  const records: UsageRecord[] = [];
  for await (const record of parser.parseFile(filePath, { model: "opus" })) {
    records.push(record);
  }
  assert.strictEqual(records.length, 1);
  assert.ok(records[0].model?.includes("opus"));
});

await test("should filter by date range", async () => {
  const parser = new UsageParser(FIXTURES_DIR);
  const filePath = path.join(FIXTURES_DIR, "sample-session.jsonl");
  const records: UsageRecord[] = [];
  for await (const record of parser.parseFile(filePath, {
    since: new Date("2025-03-15T10:32:00Z"),
    until: new Date("2025-03-15T10:36:00Z"),
  })) {
    records.push(record);
  }
  assert.strictEqual(records.length, 2);
});

await test("should handle non-existent file gracefully", async () => {
  const parser = new UsageParser(FIXTURES_DIR);
  const records: UsageRecord[] = [];
  const origWarn = console.warn;
  console.warn = () => {};
  for await (const record of parser.parseFile("/nonexistent/file.jsonl")) {
    records.push(record);
  }
  console.warn = origWarn;
  assert.strictEqual(records.length, 0);
});

// ─── UsageAggregator ─────────────────────────────────────────────────────────

group("UsageAggregator");

await test("should compute correct token totals", () => {
  const parser = new UsageParser("/tmp/nonexistent");
  const agg = new UsageAggregator(parser);
  const records: UsageRecord[] = [
    { type: "assistant", costUSD: 0.01, usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 80 }, model: "claude-sonnet-4-20250514", sessionId: "s1", timestamp: "2025-03-15T10:00:00Z" },
    { type: "assistant", costUSD: 0.02, usage: { input_tokens: 200, output_tokens: 100, cache_read_input_tokens: 150 }, model: "claude-sonnet-4-20250514", sessionId: "s1", timestamp: "2025-03-15T10:01:00Z" },
  ];
  const result = agg.aggregateRecords(records);
  assert.strictEqual(result.totalInputTokens, 300);
  assert.strictEqual(result.totalOutputTokens, 150);
  assert.strictEqual(result.totalCacheReadTokens, 230);
});

await test("should compute correct cost totals", () => {
  const parser = new UsageParser("/tmp/nonexistent");
  const agg = new UsageAggregator(parser);
  const records: UsageRecord[] = [
    { type: "assistant", costUSD: 0.0234, usage: { input_tokens: 100, output_tokens: 50 }, sessionId: "s1" },
    { type: "assistant", costUSD: 0.0456, usage: { input_tokens: 200, output_tokens: 100 }, sessionId: "s1" },
    { type: "assistant", costUSD: 0.1234, usage: { input_tokens: 300, output_tokens: 150 }, sessionId: "s2" },
  ];
  const result = agg.aggregateRecords(records);
  assert.ok(Math.abs(result.totalCostUSD - 0.1924) < 0.001);
});

await test("should count unique sessions", () => {
  const parser = new UsageParser("/tmp/nonexistent");
  const agg = new UsageAggregator(parser);
  const records: UsageRecord[] = [
    { type: "assistant", costUSD: 0.01, usage: { input_tokens: 100, output_tokens: 50 }, sessionId: "s1" },
    { type: "assistant", costUSD: 0.02, usage: { input_tokens: 200, output_tokens: 100 }, sessionId: "s1" },
    { type: "assistant", costUSD: 0.03, usage: { input_tokens: 300, output_tokens: 150 }, sessionId: "s2" },
    { type: "assistant", costUSD: 0.04, usage: { input_tokens: 400, output_tokens: 200 }, sessionId: "s3" },
  ];
  const result = agg.aggregateRecords(records);
  assert.strictEqual(result.sessionCount, 3);
  assert.strictEqual(result.recordCount, 4);
});

await test("should compute cache hit rate", () => {
  const parser = new UsageParser("/tmp/nonexistent");
  const agg = new UsageAggregator(parser);
  const records: UsageRecord[] = [
    { type: "assistant", costUSD: 0.01, usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 300 }, sessionId: "s1" },
  ];
  const result = agg.aggregateRecords(records);
  assert.strictEqual(result.cacheHitRate, 75);
});

await test("should compute average session cost", () => {
  const parser = new UsageParser("/tmp/nonexistent");
  const agg = new UsageAggregator(parser);
  const records: UsageRecord[] = [
    { type: "assistant", costUSD: 0.10, usage: { input_tokens: 100, output_tokens: 50 }, sessionId: "s1" },
    { type: "assistant", costUSD: 0.20, usage: { input_tokens: 200, output_tokens: 100 }, sessionId: "s2" },
    { type: "assistant", costUSD: 0.30, usage: { input_tokens: 300, output_tokens: 150 }, sessionId: "s3" },
  ];
  const result = agg.aggregateRecords(records);
  assert.ok(Math.abs(result.averageSessionCostUSD - 0.2) < 0.001);
});

await test("should break down by model", () => {
  const parser = new UsageParser("/tmp/nonexistent");
  const agg = new UsageAggregator(parser);
  const records: UsageRecord[] = [
    { type: "assistant", costUSD: 0.10, usage: { input_tokens: 1000, output_tokens: 500 }, model: "claude-sonnet-4-20250514", sessionId: "s1" },
    { type: "assistant", costUSD: 0.50, usage: { input_tokens: 2000, output_tokens: 800 }, model: "claude-opus-4-20250514", sessionId: "s1" },
    { type: "assistant", costUSD: 0.15, usage: { input_tokens: 1500, output_tokens: 600 }, model: "claude-sonnet-4-20250514", sessionId: "s1" },
  ];
  const result = agg.aggregateRecords(records);
  assert.strictEqual(result.byModel.size, 2);
  const sonnet = result.byModel.get("claude-sonnet-4-20250514")!;
  assert.ok(Math.abs(sonnet.costUSD - 0.25) < 0.001);
  assert.strictEqual(sonnet.inputTokens, 2500);
  assert.strictEqual(sonnet.recordCount, 2);
});

await test("should break down by day", () => {
  const parser = new UsageParser("/tmp/nonexistent");
  const agg = new UsageAggregator(parser);
  const records: UsageRecord[] = [
    { type: "assistant", costUSD: 0.10, usage: { input_tokens: 100, output_tokens: 50 }, timestamp: "2025-03-15T10:00:00Z", sessionId: "s1" },
    { type: "assistant", costUSD: 0.20, usage: { input_tokens: 200, output_tokens: 100 }, timestamp: "2025-03-15T14:00:00Z", sessionId: "s1" },
    { type: "assistant", costUSD: 0.30, usage: { input_tokens: 300, output_tokens: 150 }, timestamp: "2025-03-16T09:00:00Z", sessionId: "s2" },
  ];
  const result = agg.aggregateRecords(records);
  assert.strictEqual(result.byDay.size, 2);
  const day1 = result.byDay.get("2025-03-15")!;
  assert.ok(Math.abs(day1.costUSD - 0.30) < 0.001);
});

await test("should handle empty input", () => {
  const parser = new UsageParser("/tmp/nonexistent");
  const agg = new UsageAggregator(parser);
  const result = agg.aggregateRecords([]);
  assert.strictEqual(result.totalInputTokens, 0);
  assert.strictEqual(result.totalCostUSD, 0);
  assert.strictEqual(result.sessionCount, 0);
  assert.strictEqual(result.cacheHitRate, 0);
});

// ─── Formatting utilities ────────────────────────────────────────────────────

group("Formatting utilities");

await test("formatTokenCount adds thousands separators", () => {
  assert.strictEqual(formatTokenCount(1234567), "1,234,567");
  assert.strictEqual(formatTokenCount(0), "0");
  assert.strictEqual(formatTokenCount(999), "999");
});

await test("formatCost formats to 2 decimal places with $", () => {
  assert.strictEqual(formatCost(12.3456), "$12.35");
  assert.strictEqual(formatCost(0), "$0.00");
});

await test("formatPct rounds to whole number", () => {
  assert.strictEqual(formatPct(78.1234), "78%");
  assert.strictEqual(formatPct(0), "0%");
});

await test("barChart produces correct visual", () => {
  const bar = barChart(50, 100, 12);
  assert.strictEqual(bar, "│█████░░░░░│");
});

// ─── RateLimitCollector ──────────────────────────────────────────────────────

group("RateLimitCollector");

await test("should parse standard rate-limit headers", () => {
  const collector = new RateLimitCollector();
  const result = collector.update({
    "anthropic-ratelimit-requests-limit": "1000",
    "anthropic-ratelimit-requests-remaining": "750",
    "anthropic-ratelimit-tokens-limit": "2000000",
    "anthropic-ratelimit-tokens-remaining": "1500000",
    "anthropic-ratelimit-tokens-reset": "2025-03-28T00:00:00Z",
  });
  assert.strictEqual(result.requestsRemaining, 750);
  assert.strictEqual(result.tokensRemaining, 1500000);
  assert.strictEqual(result.resetAt, "2025-03-28T00:00:00Z");
  assert.strictEqual(result.sessionUsagePct, 25);
  assert.strictEqual(result.dailyUsagePct, 25);
});

await test("should prefer unified-status when available", () => {
  const collector = new RateLimitCollector();
  const result = collector.update({
    "anthropic-ratelimit-requests-limit": "1000",
    "anthropic-ratelimit-requests-remaining": "750",
    "anthropic-ratelimit-unified-status": JSON.stringify({
      session_usage_pct: 42.5,
      daily_usage_pct: 18.3,
    }),
  });
  assert.strictEqual(result.sessionUsagePct, 42.5);
  assert.strictEqual(result.dailyUsagePct, 18.3);
});

await test("should handle missing headers gracefully", () => {
  const collector = new RateLimitCollector();
  const result = collector.update({});
  assert.strictEqual(result.requestsRemaining, null);
  assert.strictEqual(result.tokensRemaining, null);
  assert.strictEqual(result.sessionUsagePct, 0);
});

await test("should handle malformed unified-status JSON", () => {
  const collector = new RateLimitCollector();
  const result = collector.update({
    "anthropic-ratelimit-requests-limit": "1000",
    "anthropic-ratelimit-requests-remaining": "800",
    "anthropic-ratelimit-unified-status": "not-json",
  });
  assert.strictEqual(result.sessionUsagePct, 20);
});

await test("should produce valid statusLine JSON", () => {
  const collector = new RateLimitCollector();
  collector.update({
    "anthropic-ratelimit-requests-limit": "1000",
    "anthropic-ratelimit-requests-remaining": "600",
    "anthropic-ratelimit-tokens-limit": "2000000",
    "anthropic-ratelimit-tokens-remaining": "1200000",
    "anthropic-ratelimit-tokens-reset": "2025-03-28T00:00:00Z",
  });
  const sl = collector.toStatusLine() as any;
  assert.ok(sl.rate_limits);
  assert.strictEqual(sl.rate_limits.session_usage_pct, 40);
  assert.strictEqual(sl.rate_limits.tokens_remaining, 1200000);
});

await test("isFresh returns false before any update", () => {
  const collector = new RateLimitCollector();
  assert.strictEqual(collector.isFresh(), false);
});

await test("isFresh returns true after update", () => {
  const collector = new RateLimitCollector();
  collector.update({ "anthropic-ratelimit-requests-limit": "1000", "anthropic-ratelimit-requests-remaining": "500" });
  assert.strictEqual(collector.isFresh(), true);
});

// ─── MCPIntrospector ─────────────────────────────────────────────────────────

group("MCPIntrospector");

await test("should estimate tokens from character count", () => {
  const mcp = new MCPIntrospector(200_000);
  assert.strictEqual(mcp.estimateTokens("a".repeat(100)), 25);
  assert.strictEqual(mcp.estimateTokens("abc"), 1);
  assert.strictEqual(mcp.estimateTokens(""), 0);
});

await test("should round up partial tokens", () => {
  const mcp = new MCPIntrospector(200_000);
  assert.strictEqual(mcp.estimateTokens("ab"), 1);
});

await test("should estimate tool cost from name + description + schema", () => {
  const mcp = new MCPIntrospector(200_000);
  const cost = mcp.estimateToolCost({
    name: "browser_click",
    description: "Click an element on the page identified by a CSS selector.",
    inputSchema: { type: "object", properties: { selector: { type: "string", description: "CSS selector" } }, required: ["selector"] },
  });
  assert.ok(cost > 50, `Expected cost > 50, got ${cost}`);
  assert.ok(cost < 500, `Expected cost < 500, got ${cost}`);
});

await test("should analyze a server with multiple tools", () => {
  const mcp = new MCPIntrospector(200_000);
  const tools = [
    { name: "click", description: "Click an element." },
    { name: "navigate", description: "Navigate to a URL." },
    { name: "screenshot", description: "Take a screenshot." },
  ];
  const result = mcp.analyzeServer("playwright", tools);
  assert.strictEqual(result.serverName, "playwright");
  assert.strictEqual(result.toolCount, 3);
  assert.ok(result.totalTokens > 0);
  assert.ok(result.tools[0].estimatedTokens >= result.tools[1].estimatedTokens);
});

await test("should analyze multiple servers and compute total budget", () => {
  const mcp = new MCPIntrospector(200_000);
  const servers = new Map<string, Array<{ name: string; description: string }>>();
  servers.set("playwright", [
    { name: "click", description: "Click element" },
    { name: "navigate", description: "Navigate to URL" },
  ]);
  servers.set("github", [
    { name: "create_pr", description: "Create a pull request" },
  ]);
  const result = mcp.analyzeAll(servers);
  assert.strictEqual(result.servers.length, 2);
  assert.ok(result.totalTokens > 0);
  assert.strictEqual(result.contextWindowSize, 200_000);
  assert.ok(result.usagePct > 0);
  assert.ok(result.usagePct < 1);
});

await test("should produce valid statusLine extension", () => {
  const mcp = new MCPIntrospector(200_000);
  const servers = new Map<string, Array<{ name: string; description: string }>>();
  servers.set("test", [{ name: "tool1", description: "Test tool" }]);
  const budget = mcp.analyzeAll(servers);
  const sl = mcp.toStatusLine(budget);
  assert.ok(typeof sl.mcp_context_tokens === "number");
  assert.ok(typeof sl.mcp_context_pct === "number");
});

// ─── TerminalFormatter ───────────────────────────────────────────────────────

group("TerminalFormatter");

await test("should format a summary without crashing", () => {
  const parser = new UsageParser("/tmp/nonexistent");
  const agg = new UsageAggregator(parser);
  const records: UsageRecord[] = [
    { type: "assistant", costUSD: 0.50, usage: { input_tokens: 5000, output_tokens: 2000, cache_read_input_tokens: 3000 }, model: "claude-sonnet-4-20250514", sessionId: "s1", timestamp: "2025-03-15T10:00:00Z", projectPath: "my-app" },
    { type: "assistant", costUSD: 1.20, usage: { input_tokens: 12000, output_tokens: 4000 }, model: "claude-opus-4-20250514", sessionId: "s2", timestamp: "2025-03-16T14:00:00Z", projectPath: "backend" },
  ];
  const usage = agg.aggregateRecords(records);
  const formatter = new TerminalFormatter();
  const output = formatter.formatSummary(usage);
  assert.ok(output.includes("Claude Code Usage Summary"));
  assert.ok(output.includes("Sessions:"));
  assert.ok(output.includes("Total cost:"));
  assert.ok(output.includes("Tokens"));
});

await test("should format JSON output as valid JSON", () => {
  const parser = new UsageParser("/tmp/nonexistent");
  const agg = new UsageAggregator(parser);
  const records: UsageRecord[] = [
    { type: "assistant", costUSD: 0.50, usage: { input_tokens: 5000, output_tokens: 2000 }, model: "claude-sonnet-4-20250514", sessionId: "s1" },
  ];
  const usage = agg.aggregateRecords(records);
  const formatter = new TerminalFormatter();
  const jsonOutput = formatter.formatJSON(usage);
  const parsed = JSON.parse(jsonOutput);
  assert.ok(parsed.summary);
  assert.strictEqual(parsed.summary.sessions, 1);
  assert.strictEqual(parsed.summary.total_cost_usd, 0.5);
  assert.ok(Array.isArray(parsed.by_model));
});

// ─── parseArgs ───────────────────────────────────────────────────────────────

group("parseArgs");

await test("should parse all flags correctly", () => {
  const opts = parseArgs(["--since", "2025-03-01", "--until", "2025-03-28", "--project", "my-app", "--model", "sonnet", "--json", "--verbose"]);
  assert.strictEqual(opts.since, "2025-03-01");
  assert.strictEqual(opts.until, "2025-03-28");
  assert.strictEqual(opts.project, "my-app");
  assert.strictEqual(opts.model, "sonnet");
  assert.strictEqual(opts.json, true);
  assert.strictEqual(opts.verbose, true);
});

await test("should handle short flags", () => {
  const opts = parseArgs(["-w", "-v"]);
  assert.strictEqual(opts.watch, true);
  assert.strictEqual(opts.verbose, true);
});

await test("should handle empty args", () => {
  const opts = parseArgs([]);
  assert.strictEqual(opts.since, undefined);
  assert.strictEqual(opts.watch, undefined);
});

// ─── UsageCommand integration ────────────────────────────────────────────────

group("UsageCommand integration");

await test("should execute summary with empty data without crashing", async () => {
  const cmd = new UsageCommand("/tmp/nonexistent-dir");
  const output = await cmd.execute({});
  assert.ok(typeof output === "string");
  assert.ok(output.includes("Claude Code Usage Summary"));
});

await test("should execute --json and return valid JSON", async () => {
  const cmd = new UsageCommand("/tmp/nonexistent-dir");
  const output = await cmd.execute({ json: true });
  const parsed = JSON.parse(output);
  assert.ok(parsed.summary);
});

await test("should execute --rate-limit without crashing", async () => {
  const cmd = new UsageCommand("/tmp/nonexistent-dir");
  const output = await cmd.execute({ rateLimit: true });
  assert.ok(output.includes("Rate Limits"));
});

await test("should execute --mcp-breakdown without crashing", async () => {
  const cmd = new UsageCommand("/tmp/nonexistent-dir");
  const output = await cmd.execute({ mcpBreakdown: true });
  assert.ok(output.includes("MCP Context Budget"));
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(55));
if (failed === 0) {
  console.log(`\x1b[1m  ${passed}/${passed + failed} tests passed\x1b[0m  \x1b[32m✓ all passing\x1b[0m`);
} else {
  console.log(`\x1b[1m  ${passed}/${passed + failed} tests passed\x1b[0m  \x1b[31m(${failed} failed)\x1b[0m`);
  console.log(`\n\x1b[31mFailed tests:\x1b[0m`);
  for (const f of failures) {
    console.log(`  • ${f}`);
  }
}
console.log("═".repeat(55) + "\n");

if (failed > 0) process.exit(1);

} // end main

main().catch((err) => { console.error(err); process.exit(1); });
