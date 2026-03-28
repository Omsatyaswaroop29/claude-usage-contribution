/**
 * CLI Command Handler for `claude usage`.
 */

import { UsageParser } from "../usage-parser";
import { UsageAggregator } from "../usage-aggregator";
import { RateLimitCollector } from "../rate-limit-collector";
import { MCPIntrospector } from "../mcp-introspector";
import { TerminalFormatter } from "../formatters/terminal";
import { UsageCLIOptions, UsageFilter } from "../types";

export class UsageCommand {
  private parser: UsageParser;
  private aggregator: UsageAggregator;
  private rateLimitCollector: RateLimitCollector;
  private mcpIntrospector: MCPIntrospector;
  private formatter: TerminalFormatter;

  constructor(projectsDir?: string) {
    this.parser = new UsageParser(projectsDir);
    this.aggregator = new UsageAggregator(this.parser);
    this.rateLimitCollector = new RateLimitCollector();
    this.mcpIntrospector = new MCPIntrospector();
    this.formatter = new TerminalFormatter();
  }

  async execute(options: UsageCLIOptions): Promise<string> {
    if (options.rateLimit) return this.handleRateLimit();
    if (options.mcpBreakdown) return this.handleMCPBreakdown();
    if (options.watch) return this.handleWatch(options);
    return this.handleSummary(options);
  }

  private async handleSummary(options: UsageCLIOptions): Promise<string> {
    const filter = this.buildFilter(options);
    const usage = await this.aggregator.aggregate(filter);

    if (options.json) return this.formatter.formatJSON(usage);

    let output = this.formatter.formatSummary(usage, {
      since: options.since,
      until: options.until,
    });

    if (options.verbose) {
      output += "\n" + this.formatter.formatVerbose(usage);
    }

    return output;
  }

  private handleRateLimit(): string {
    return this.rateLimitCollector.toTerminalString();
  }

  private handleMCPBreakdown(): string {
    const configs = this.mcpIntrospector.readMCPConfig();

    if (configs.size === 0) {
      return [
        "MCP Context Budget",
        "━".repeat(45),
        "",
        "  No MCP servers configured.",
        "  Add servers via `claude mcp add` or edit .mcp.json",
      ].join("\n");
    }

    const lines = [
      "MCP Context Budget",
      "━".repeat(45),
      "",
      `  Found ${configs.size} configured MCP server(s):`,
      "",
    ];

    for (const [name, config] of configs) {
      lines.push(`  Server: ${name}`);
      lines.push(`    Command: ${config.command} ${(config.args || []).join(" ")}`);
      lines.push(`    Status: Requires tools/list query for token estimates`);
      lines.push("");
    }

    lines.push("  Run with an active session to get full token estimates.");
    return lines.join("\n");
  }

  private async handleWatch(options: UsageCLIOptions): Promise<string> {
    const filter = this.buildFilter(options);
    const usage = await this.aggregator.aggregate(filter);
    return this.formatter.formatSummary(usage, {
      since: options.since,
      until: options.until,
    });
  }

  private buildFilter(options: UsageCLIOptions): UsageFilter {
    const filter: UsageFilter = {};

    if (options.since) {
      filter.since = new Date(options.since);
      if (isNaN(filter.since.getTime())) throw new Error(`Invalid date: ${options.since}`);
    }
    if (options.until) {
      filter.until = new Date(options.until);
      if (isNaN(filter.until.getTime())) throw new Error(`Invalid date: ${options.until}`);
    }
    if (options.project) filter.project = options.project;
    if (options.model) filter.model = options.model;

    return filter;
  }
}

export function parseArgs(argv: string[]): UsageCLIOptions {
  const options: UsageCLIOptions = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--since": options.since = argv[++i]; break;
      case "--until": options.until = argv[++i]; break;
      case "--project": options.project = argv[++i]; break;
      case "--model": options.model = argv[++i]; break;
      case "--watch": case "-w": options.watch = true; break;
      case "--json": options.json = true; break;
      case "--verbose": case "-v": options.verbose = true; break;
      case "--rate-limit": options.rateLimit = true; break;
      case "--mcp-breakdown": options.mcpBreakdown = true; break;
    }
  }

  return options;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  try {
    const options = parseArgs(argv);
    const command = new UsageCommand();
    const output = await command.execute(options);
    process.stdout.write(output + "\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}
