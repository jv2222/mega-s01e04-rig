import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import type { Night } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

export type NightCounts = { ok: number; retry: number; fail: number };

export type NightSummary = { night: string; counts: NightCounts | null };

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function nightCounts(night: Night): NightCounts {
  const runs = night.rows.reduce((sum, row) => sum + row.runs, 0);
  const retry = night.rows.reduce((sum, row) => sum + row.retries, 0);
  const fail = night.rows.filter((row) => row.lastStatus === 'fail').length;
  return { ok: runs - retry - fail, retry, fail };
}

export function summarizeNight(runsDir: string, night: string): NightSummary {
  const read = readNight(runsDir, night);
  return { night, counts: read === null ? null : nightCounts(read) };
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => summarizeNight(config.runsDir, night)),
  };
}
