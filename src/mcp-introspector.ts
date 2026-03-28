/**
 * MCPIntrospector — Queries MCP servers to determine context budget usage.
 *
 * Each MCP server exposes tools via the tools/list JSON-RPC method.
 * Every tool's name, description, and input schema contribute tokens
 * to the context window. This module estimates the token cost per tool
 * and per server, giving users visibility into where their 200k context
 * window budget is going.
 */

import * as fs from "fs";
import * as path from "path";
import { MCPToolInfo, MCPServerBudget, MCPContextBudget } from "./types";

const DEFAULT_CONTEXT_WINDOW = 200_000;
const CHARS_PER_TOKEN = 4;

export class MCPIntrospector {
  private contextWindowSize: number;

  constructor(contextWindowSize: number = DEFAULT_CONTEXT_WINDOW) {
    this.contextWindowSize = contextWindowSize;
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  estimateToolCost(tool: {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }): number {
    let charCount = 0;
    charCount += tool.name.length;
    if (tool.description) charCount += tool.description.length;
    if (tool.inputSchema) charCount += JSON.stringify(tool.inputSchema).length;
    const overhead = 50 * CHARS_PER_TOKEN;
    return this.estimateTokens(String(charCount + overhead));
  }

  analyzeServer(
    serverName: string,
    toolsListResponse: Array<{
      name: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
    }>
  ): MCPServerBudget {
    const tools: MCPToolInfo[] = toolsListResponse.map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      inputSchema: tool.inputSchema,
      estimatedTokens: this.estimateToolCost(tool),
    }));

    tools.sort((a, b) => b.estimatedTokens - a.estimatedTokens);
    const totalTokens = tools.reduce((sum, t) => sum + t.estimatedTokens, 0);

    return { serverName, tools, totalTokens, toolCount: tools.length };
  }

  analyzeAll(
    servers: Map<
      string,
      Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>
    >
  ): MCPContextBudget {
    const serverBudgets: MCPServerBudget[] = [];

    for (const [name, tools] of servers) {
      serverBudgets.push(this.analyzeServer(name, tools));
    }

    serverBudgets.sort((a, b) => b.totalTokens - a.totalTokens);
    const totalTokens = serverBudgets.reduce((sum, s) => sum + s.totalTokens, 0);

    return {
      servers: serverBudgets,
      totalTokens,
      contextWindowSize: this.contextWindowSize,
      usagePct: (totalTokens / this.contextWindowSize) * 100,
    };
  }

  readMCPConfig(
    projectDir?: string
  ): Map<string, { command: string; args?: string[]; env?: Record<string, string> }> {
    const configs = new Map<
      string,
      { command: string; args?: string[]; env?: Record<string, string> }
    >();

    const projectMcpPath = projectDir ? path.join(projectDir, ".mcp.json") : null;
    if (projectMcpPath && fs.existsSync(projectMcpPath)) {
      this.loadMCPFile(projectMcpPath, configs);
    }

    const userMcpPath = path.join(process.env.HOME || "~", ".claude", ".mcp.json");
    if (fs.existsSync(userMcpPath)) {
      this.loadMCPFile(userMcpPath, configs);
    }

    return configs;
  }

  toTerminalString(budget: MCPContextBudget): string {
    const lines: string[] = [];
    lines.push("MCP Context Budget");
    lines.push("━".repeat(45));
    lines.push("");
    lines.push(
      `  Total MCP context: ${budget.totalTokens.toLocaleString()} tokens (${budget.usagePct.toFixed(1)}% of ${(budget.contextWindowSize / 1000).toFixed(0)}k window)`
    );
    lines.push("");

    for (const server of budget.servers) {
      lines.push(`  Server: ${server.serverName}`);
      lines.push(`    Tools: ${server.toolCount}          Cost: ${server.totalTokens.toLocaleString()} tokens`);

      const showCount = Math.min(3, server.tools.length);
      for (let i = 0; i < showCount; i++) {
        const tool = server.tools[i];
        const prefix = i < showCount - 1 ? "├─" : "└─";
        const nameStr = tool.name.padEnd(25);
        lines.push(`    ${prefix} ${nameStr} ${tool.estimatedTokens.toLocaleString()} tokens`);
      }
      if (server.tools.length > 3) {
        lines.push(`    └─ ... (${server.tools.length - 3} more)`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  toStatusLine(budget: MCPContextBudget): Record<string, unknown> {
    return {
      mcp_context_tokens: budget.totalTokens,
      mcp_context_pct: Math.round(budget.usagePct * 10) / 10,
    };
  }

  private loadMCPFile(
    filePath: string,
    configs: Map<string, { command: string; args?: string[]; env?: Record<string, string> }>
  ): void {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed.mcpServers) {
        for (const [name, config] of Object.entries(parsed.mcpServers)) {
          if (!configs.has(name)) {
            configs.set(name, config as { command: string; args?: string[]; env?: Record<string, string> });
          }
        }
      }
    } catch {
      console.warn(`[mcp-introspector] Failed to parse ${filePath}`);
    }
  }
}
