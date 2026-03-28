/**
 * UsageParser — Stream-based JSONL transcript parser for Claude Code.
 *
 * Reads Claude Code session transcripts from ~/.claude/projects/ and
 * yields structured UsageRecord objects. Designed for memory efficiency:
 * processes line-by-line, never loads entire files into memory.
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { UsageRecord, UsageFilter } from "./types";

const DEFAULT_PROJECTS_DIR = path.join(
  process.env.HOME || "~",
  ".claude",
  "projects"
);

export class UsageParser {
  private projectsDir: string;

  constructor(projectsDir?: string) {
    this.projectsDir = projectsDir || DEFAULT_PROJECTS_DIR;
  }

  async *parseFile(
    filePath: string,
    filter?: UsageFilter
  ): AsyncGenerator<UsageRecord> {
    if (!fs.existsSync(filePath)) {
      console.warn(`[usage-parser] File not found: ${filePath}`);
      return;
    }

    const fileStream = fs.createReadStream(filePath, { encoding: "utf-8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    const sessionId = path.basename(filePath, ".jsonl");
    const projectPath = path.basename(path.dirname(filePath));
    let lineNumber = 0;

    for await (const line of rl) {
      lineNumber++;
      if (!line.trim()) continue;

      let record: UsageRecord;
      try {
        record = JSON.parse(line);
      } catch {
        console.warn(
          `[usage-parser] Malformed JSON at ${filePath}:${lineNumber}, skipping`
        );
        continue;
      }

      if (!record.usage && !record.costUSD) continue;

      record.sessionId = record.sessionId || sessionId;
      record.projectPath = record.projectPath || projectPath;

      if (filter && !this.matchesFilter(record, filter)) continue;

      yield record;
    }
  }

  async discoverFiles(filter?: UsageFilter): Promise<string[]> {
    const files: { path: string; mtime: number }[] = [];

    if (!fs.existsSync(this.projectsDir)) {
      console.warn(
        `[usage-parser] Projects directory not found: ${this.projectsDir}`
      );
      return [];
    }

    const projectDirs = fs.readdirSync(this.projectsDir, {
      withFileTypes: true,
    });

    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;
      if (filter?.project && !dir.name.includes(filter.project)) continue;

      const projectDir = path.join(this.projectsDir, dir.name);
      const entries = fs.readdirSync(projectDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;

        const filePath = path.join(projectDir, entry.name);
        const stat = fs.statSync(filePath);

        if (filter?.since && stat.mtime < filter.since) continue;
        if (filter?.until && stat.birthtime > filter.until) continue;

        files.push({ path: filePath, mtime: stat.mtimeMs });
      }
    }

    files.sort((a, b) => b.mtime - a.mtime);
    return files.map((f) => f.path);
  }

  async *parseAll(filter?: UsageFilter): AsyncGenerator<UsageRecord> {
    const files = await this.discoverFiles(filter);
    for (const filePath of files) {
      yield* this.parseFile(filePath, filter);
    }
  }

  private matchesFilter(record: UsageRecord, filter: UsageFilter): boolean {
    if (record.timestamp) {
      const recordDate = new Date(record.timestamp);
      if (filter.since && recordDate < filter.since) return false;
      if (filter.until && recordDate > filter.until) return false;
    }
    if (filter.model && record.model) {
      if (!record.model.includes(filter.model)) return false;
    }
    if (filter.sessionId && record.sessionId !== filter.sessionId) {
      return false;
    }
    return true;
  }
}

export function parseJSONLString(content: string): UsageRecord[] {
  const records: UsageRecord[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as UsageRecord;
      if (record.usage || record.costUSD) {
        records.push(record);
      }
    } catch {
      // Skip malformed lines
    }
  }
  return records;
}
