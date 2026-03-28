/**
 * UsageAggregator — Computes summary metrics from parsed UsageRecords.
 *
 * Takes a stream of UsageRecords from the parser and produces an
 * AggregatedUsage object with breakdowns by model, project, and day.
 * Designed for incremental computation: processes records one at a time,
 * maintaining running totals.
 */

import {
  UsageRecord,
  AggregatedUsage,
  ModelBreakdown,
  ProjectBreakdown,
  DailyBreakdown,
  UsageFilter,
} from "./types";
import { UsageParser } from "./usage-parser";

export class UsageAggregator {
  private parser: UsageParser;

  constructor(parser: UsageParser) {
    this.parser = parser;
  }

  async aggregate(filter?: UsageFilter): Promise<AggregatedUsage> {
    const result = this.createEmptyAggregation();
    const seenSessions = new Set<string>();

    for await (const record of this.parser.parseAll(filter)) {
      this.addRecord(result, record, seenSessions);
    }

    this.finalize(result);
    return result;
  }

  aggregateRecords(records: UsageRecord[]): AggregatedUsage {
    const result = this.createEmptyAggregation();
    const seenSessions = new Set<string>();

    for (const record of records) {
      this.addRecord(result, record, seenSessions);
    }

    this.finalize(result);
    return result;
  }

  private createEmptyAggregation(): AggregatedUsage {
    return {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      totalCostUSD: 0,
      totalDurationMs: 0,
      sessionCount: 0,
      recordCount: 0,
      cacheHitRate: 0,
      averageSessionCostUSD: 0,
      byModel: new Map<string, ModelBreakdown>(),
      byProject: new Map<string, ProjectBreakdown>(),
      byDay: new Map<string, DailyBreakdown>(),
    };
  }

  private addRecord(
    agg: AggregatedUsage,
    record: UsageRecord,
    seenSessions: Set<string>
  ): void {
    agg.recordCount++;

    if (record.sessionId && !seenSessions.has(record.sessionId)) {
      seenSessions.add(record.sessionId);
      agg.sessionCount++;
    }

    if (record.usage) {
      agg.totalInputTokens += record.usage.input_tokens || 0;
      agg.totalOutputTokens += record.usage.output_tokens || 0;
      agg.totalCacheCreationTokens +=
        record.usage.cache_creation_input_tokens || 0;
      agg.totalCacheReadTokens += record.usage.cache_read_input_tokens || 0;
    }

    agg.totalCostUSD += record.costUSD || 0;
    agg.totalDurationMs += record.durationMs || 0;

    if (record.model) {
      const modelKey = record.model;
      if (!agg.byModel.has(modelKey)) {
        agg.byModel.set(modelKey, {
          model: modelKey,
          inputTokens: 0,
          outputTokens: 0,
          costUSD: 0,
          recordCount: 0,
        });
      }
      const m = agg.byModel.get(modelKey)!;
      m.inputTokens += record.usage?.input_tokens || 0;
      m.outputTokens += record.usage?.output_tokens || 0;
      m.costUSD += record.costUSD || 0;
      m.recordCount++;
    }

    if (record.projectPath) {
      const projKey = record.projectPath;
      if (!agg.byProject.has(projKey)) {
        agg.byProject.set(projKey, {
          projectPath: projKey,
          inputTokens: 0,
          outputTokens: 0,
          costUSD: 0,
          sessionCount: 0,
        });
      }
      const p = agg.byProject.get(projKey)!;
      p.inputTokens += record.usage?.input_tokens || 0;
      p.outputTokens += record.usage?.output_tokens || 0;
      p.costUSD += record.costUSD || 0;
    }

    if (record.timestamp) {
      const day = record.timestamp.substring(0, 10);
      if (!agg.byDay.has(day)) {
        agg.byDay.set(day, {
          date: day,
          inputTokens: 0,
          outputTokens: 0,
          costUSD: 0,
          sessionCount: 0,
        });
      }
      const d = agg.byDay.get(day)!;
      d.inputTokens += record.usage?.input_tokens || 0;
      d.outputTokens += record.usage?.output_tokens || 0;
      d.costUSD += record.costUSD || 0;
    }
  }

  private finalize(agg: AggregatedUsage): void {
    const totalInput = agg.totalInputTokens + agg.totalCacheReadTokens;
    if (totalInput > 0) {
      agg.cacheHitRate = (agg.totalCacheReadTokens / totalInput) * 100;
    }
    if (agg.sessionCount > 0) {
      agg.averageSessionCostUSD = agg.totalCostUSD / agg.sessionCount;
    }
  }
}

export function formatTokenCount(count: number): string {
  return count.toLocaleString("en-US");
}

export function formatCost(costUSD: number): string {
  return `$${costUSD.toFixed(2)}`;
}

export function formatPct(pct: number): string {
  return `${Math.round(pct)}%`;
}

export function barChart(value: number, total: number, width: number = 30): string {
  const filled = Math.round((value / total) * (width - 2));
  const empty = width - 2 - filled;
  return `│${"█".repeat(filled)}${"░".repeat(Math.max(0, empty))}│`;
}
