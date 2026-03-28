/**
 * Type definitions for claude usage observability layer.
 *
 * These types model the JSONL transcript format written by Claude Code
 * at ~/.claude/projects/<hash>/<session>.jsonl, the rate-limit headers
 * from the Anthropic API, and the MCP tool introspection responses.
 */

// ─── JSONL Transcript Types ─────────────────────────────────────────────────

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface UsageRecord {
  type: "assistant" | "user" | "system";
  costUSD?: number;
  durationMs?: number;
  usage?: TokenUsage;
  model?: string;
  timestamp?: string;
  sessionId?: string;
  projectPath?: string;
  toolName?: string;
  mcpServer?: string;
}

// ─── Aggregated Metrics Types ────────────────────────────────────────────────

export interface AggregatedUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalCostUSD: number;
  totalDurationMs: number;
  sessionCount: number;
  recordCount: number;
  cacheHitRate: number;
  averageSessionCostUSD: number;
  byModel: Map<string, ModelBreakdown>;
  byProject: Map<string, ProjectBreakdown>;
  byDay: Map<string, DailyBreakdown>;
}

export interface ModelBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  recordCount: number;
}

export interface ProjectBreakdown {
  projectPath: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  sessionCount: number;
}

export interface DailyBreakdown {
  date: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  sessionCount: number;
}

// ─── Filter Types ────────────────────────────────────────────────────────────

export interface UsageFilter {
  since?: Date;
  until?: Date;
  project?: string;
  model?: string;
  sessionId?: string;
}

// ─── Rate Limit Types ────────────────────────────────────────────────────────

export interface RateLimitInfo {
  sessionUsagePct: number;
  dailyUsagePct: number;
  requestsRemaining: number | null;
  tokensRemaining: number | null;
  resetAt: string | null;
  plan: string | null;
}

export interface RateLimitHeaders {
  "anthropic-ratelimit-requests-limit"?: string;
  "anthropic-ratelimit-requests-remaining"?: string;
  "anthropic-ratelimit-requests-reset"?: string;
  "anthropic-ratelimit-tokens-limit"?: string;
  "anthropic-ratelimit-tokens-remaining"?: string;
  "anthropic-ratelimit-tokens-reset"?: string;
  "anthropic-ratelimit-unified-status"?: string;
  [key: string]: string | undefined;
}

// ─── MCP Introspection Types ─────────────────────────────────────────────────

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  estimatedTokens: number;
}

export interface MCPServerBudget {
  serverName: string;
  tools: MCPToolInfo[];
  totalTokens: number;
  toolCount: number;
}

export interface MCPContextBudget {
  servers: MCPServerBudget[];
  totalTokens: number;
  contextWindowSize: number;
  usagePct: number;
}

// ─── StatusLine Extension ────────────────────────────────────────────────────

export interface StatusLineExtension {
  rate_limits?: RateLimitInfo;
  mcp_context_tokens?: number;
  mcp_context_pct?: number;
}

// ─── CLI Options ─────────────────────────────────────────────────────────────

export interface UsageCLIOptions {
  since?: string;
  until?: string;
  project?: string;
  model?: string;
  watch?: boolean;
  json?: boolean;
  verbose?: boolean;
  rateLimit?: boolean;
  mcpBreakdown?: boolean;
}
