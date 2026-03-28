/**
 * RateLimitCollector — Extracts and computes rate-limit metrics from
 * Anthropic API response headers.
 */

import { RateLimitInfo, RateLimitHeaders } from "./types";

export class RateLimitCollector {
  private latestInfo: RateLimitInfo;
  private lastUpdated: Date | null = null;

  constructor() {
    this.latestInfo = this.createEmpty();
  }

  update(headers: RateLimitHeaders): RateLimitInfo {
    const requestsLimit = this.parseNum(headers["anthropic-ratelimit-requests-limit"]);
    const requestsRemaining = this.parseNum(headers["anthropic-ratelimit-requests-remaining"]);
    const tokensLimit = this.parseNum(headers["anthropic-ratelimit-tokens-limit"]);
    const tokensRemaining = this.parseNum(headers["anthropic-ratelimit-tokens-remaining"]);
    const tokensReset = headers["anthropic-ratelimit-tokens-reset"] || null;

    let sessionUsagePct = 0;
    let dailyUsagePct = 0;

    if (requestsLimit !== null && requestsRemaining !== null) {
      sessionUsagePct = ((requestsLimit - requestsRemaining) / requestsLimit) * 100;
    }

    const unifiedStatus = headers["anthropic-ratelimit-unified-status"];
    if (unifiedStatus) {
      try {
        const status = JSON.parse(unifiedStatus);
        if (status.daily_usage_pct !== undefined) dailyUsagePct = status.daily_usage_pct;
        if (status.session_usage_pct !== undefined) sessionUsagePct = status.session_usage_pct;
      } catch {
        // Fall back to header-based calculation
      }
    }

    if (dailyUsagePct === 0 && tokensLimit !== null && tokensRemaining !== null) {
      dailyUsagePct = ((tokensLimit - tokensRemaining) / tokensLimit) * 100;
    }

    this.latestInfo = {
      sessionUsagePct: Math.round(sessionUsagePct * 10) / 10,
      dailyUsagePct: Math.round(dailyUsagePct * 10) / 10,
      requestsRemaining,
      tokensRemaining,
      resetAt: tokensReset,
      plan: null,
    };

    this.lastUpdated = new Date();
    return this.latestInfo;
  }

  getLatest(): RateLimitInfo {
    return { ...this.latestInfo };
  }

  isFresh(): boolean {
    if (!this.lastUpdated) return false;
    return Date.now() - this.lastUpdated.getTime() < 60_000;
  }

  toStatusLine(): Record<string, unknown> {
    return {
      rate_limits: {
        session_usage_pct: this.latestInfo.sessionUsagePct,
        daily_usage_pct: this.latestInfo.dailyUsagePct,
        requests_remaining: this.latestInfo.requestsRemaining,
        tokens_remaining: this.latestInfo.tokensRemaining,
        reset_at: this.latestInfo.resetAt,
        plan: this.latestInfo.plan,
      },
    };
  }

  toTerminalString(): string {
    const info = this.latestInfo;
    const lines: string[] = [];
    lines.push("Rate Limits");
    lines.push("━".repeat(45));
    lines.push("");
    lines.push(`  Session usage:  ${info.sessionUsagePct.toFixed(1)}%  ${this.miniBar(info.sessionUsagePct)}`);
    lines.push(`  Daily usage:    ${info.dailyUsagePct.toFixed(1)}%  ${this.miniBar(info.dailyUsagePct)}`);
    if (info.requestsRemaining !== null) {
      lines.push(`  Requests left:  ${info.requestsRemaining.toLocaleString()}`);
    }
    if (info.tokensRemaining !== null) {
      lines.push(`  Tokens left:    ${info.tokensRemaining.toLocaleString()}`);
    }
    if (info.resetAt) {
      lines.push(`  Resets at:      ${info.resetAt}`);
    }
    if (!this.isFresh()) {
      lines.push("");
      lines.push("  ⚠ Data may be stale (no recent API calls)");
    }
    return lines.join("\n");
  }

  private miniBar(pct: number, width: number = 20): string {
    const filled = Math.round((pct / 100) * width);
    const empty = width - filled;
    return `[${"■".repeat(filled)}${"·".repeat(Math.max(0, empty))}]${pct > 80 ? " ⚠" : ""}`;
  }

  private parseNum(value: string | undefined): number | null {
    if (!value) return null;
    const num = parseInt(value, 10);
    return isNaN(num) ? null : num;
  }

  private createEmpty(): RateLimitInfo {
    return {
      sessionUsagePct: 0,
      dailyUsagePct: 0,
      requestsRemaining: null,
      tokensRemaining: null,
      resetAt: null,
      plan: null,
    };
  }
}
