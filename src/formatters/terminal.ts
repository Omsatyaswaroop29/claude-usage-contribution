/**
 * Terminal formatter for `claude usage` output.
 */

import {
  AggregatedUsage,
  ModelBreakdown,
  ProjectBreakdown,
} from "../types";
import {
  formatTokenCount,
  formatCost,
  formatPct,
  barChart,
} from "../usage-aggregator";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

const isTTY = process.stdout.isTTY || false;

function bold(s: string): string { return isTTY ? `${BOLD}${s}${RESET}` : s; }
function dim(s: string): string { return isTTY ? `${DIM}${s}${RESET}` : s; }
function green(s: string): string { return isTTY ? `${GREEN}${s}${RESET}` : s; }
function cyan(s: string): string { return isTTY ? `${CYAN}${s}${RESET}` : s; }

export class TerminalFormatter {
  formatSummary(
    usage: AggregatedUsage,
    dateRange?: { since?: string; until?: string }
  ): string {
    const lines: string[] = [];
    const rangeStr = this.formatDateRange(dateRange);
    lines.push(bold(`Claude Code Usage Summary ${rangeStr}`));
    lines.push("━".repeat(50));
    lines.push("");
    lines.push(`  Sessions:     ${bold(usage.sessionCount.toString())}`);
    lines.push(`  Total cost:   ${bold(green(formatCost(usage.totalCostUSD)))}`);
    lines.push(`  Avg/session:  ${dim(formatCost(usage.averageSessionCostUSD))}`);
    lines.push("");
    lines.push(`  ${bold("Tokens")}`);
    lines.push(`    Input:      ${formatTokenCount(usage.totalInputTokens)}  ${dim(`(cache hit: ${formatPct(usage.cacheHitRate)})`)}`);
    lines.push(`    Output:     ${formatTokenCount(usage.totalOutputTokens)}`);
    if (usage.totalCacheCreationTokens > 0) {
      lines.push(`    Cache write: ${formatTokenCount(usage.totalCacheCreationTokens)}`);
    }
    lines.push("");

    if (usage.byModel.size > 0) {
      lines.push(`  ${bold("By model")}`);
      const models = Array.from(usage.byModel.values()).sort((a, b) => b.costUSD - a.costUSD);
      for (const model of models) {
        const pct = usage.totalCostUSD > 0 ? (model.costUSD / usage.totalCostUSD) * 100 : 0;
        const shortName = this.shortenModelName(model.model);
        const costStr = formatCost(model.costUSD).padStart(7);
        const pctStr = `(${formatPct(pct)})`.padStart(6);
        const bar = barChart(model.costUSD, usage.totalCostUSD);
        lines.push(`    ${cyan(shortName.padEnd(16))} ${costStr}  ${pctStr}  ${bar}`);
      }
      lines.push("");
    }

    if (usage.byProject.size > 0) {
      lines.push(`  ${bold("Top projects")}`);
      const projects = Array.from(usage.byProject.values())
        .sort((a, b) => b.costUSD - a.costUSD)
        .slice(0, 5);
      for (const proj of projects) {
        const shortName = this.shortenProjectName(proj.projectPath);
        const costStr = formatCost(proj.costUSD).padStart(7);
        const bar = barChart(proj.costUSD, usage.totalCostUSD);
        lines.push(`    ${shortName.padEnd(16)} ${costStr}  ${bar}`);
      }
      if (usage.byProject.size > 5) {
        lines.push(dim(`    ... and ${usage.byProject.size - 5} more`));
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  formatVerbose(usage: AggregatedUsage): string {
    const lines: string[] = [];
    lines.push(bold("Per-day breakdown"));
    lines.push("━".repeat(50));
    lines.push("");
    lines.push(dim("  Date          Input       Output      Cost"));
    lines.push(dim("  " + "─".repeat(48)));
    const days = Array.from(usage.byDay.values()).sort((a, b) => b.date.localeCompare(a.date));
    for (const day of days) {
      const input = formatTokenCount(day.inputTokens).padStart(10);
      const output = formatTokenCount(day.outputTokens).padStart(10);
      const cost = formatCost(day.costUSD).padStart(8);
      lines.push(`  ${day.date}  ${input}  ${output}  ${cost}`);
    }
    lines.push("");
    return lines.join("\n");
  }

  formatJSON(usage: AggregatedUsage): string {
    const obj = {
      summary: {
        sessions: usage.sessionCount,
        records: usage.recordCount,
        total_cost_usd: Math.round(usage.totalCostUSD * 100) / 100,
        average_session_cost_usd: Math.round(usage.averageSessionCostUSD * 100) / 100,
        total_input_tokens: usage.totalInputTokens,
        total_output_tokens: usage.totalOutputTokens,
        cache_hit_rate_pct: Math.round(usage.cacheHitRate * 10) / 10,
        total_duration_ms: usage.totalDurationMs,
      },
      by_model: Array.from(usage.byModel.values()).map((m) => ({
        model: m.model,
        cost_usd: Math.round(m.costUSD * 100) / 100,
        input_tokens: m.inputTokens,
        output_tokens: m.outputTokens,
        records: m.recordCount,
      })),
      by_project: Array.from(usage.byProject.values()).map((p) => ({
        project: p.projectPath,
        cost_usd: Math.round(p.costUSD * 100) / 100,
        input_tokens: p.inputTokens,
        output_tokens: p.outputTokens,
      })),
      by_day: Array.from(usage.byDay.values())
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((d) => ({
          date: d.date,
          cost_usd: Math.round(d.costUSD * 100) / 100,
          input_tokens: d.inputTokens,
          output_tokens: d.outputTokens,
        })),
    };
    return JSON.stringify(obj, null, 2);
  }

  private formatDateRange(range?: { since?: string; until?: string }): string {
    if (!range?.since && !range?.until) return dim("(all time)");
    const since = range?.since || "...";
    const until = range?.until || "now";
    return dim(`(${since} → ${until})`);
  }

  private shortenModelName(model: string): string {
    return model.replace("claude-", "").replace(/-\d{8}$/, "");
  }

  private shortenProjectName(projectPath: string): string {
    const parts = projectPath.split(/[/\\]/);
    const name = parts[parts.length - 1] || projectPath;
    return name.length > 15 ? name.substring(0, 14) + "…" : name;
  }
}
