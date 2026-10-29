import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunStatus } from './types.js';

type RunLine = {
  at: string;
  time: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

const statuses: readonly string[] = ['ok', 'retry', 'fail'];

function isRunStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && statuses.includes(value);
}

function parseLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string' || !isRunStatus(status)) return null;
  const time = Date.parse(at);
  if (Number.isNaN(time)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  return { at, time, job, status, owner: owner ?? null, error: error ?? null };
}

type Tally = DigestRow & { lastTime: number; firstTime: number; lastErrorTime: number };

function tallyLine(tally: Tally | undefined, line: RunLine): Tally {
  if (!tally) {
    return {
      job: line.job,
      owner: line.owner,
      runs: 1,
      retries: line.status === 'retry' ? 1 : 0,
      lastStatus: line.status,
      lastError: line.error,
      firstAt: line.at,
      lastAt: line.at,
      firstTime: line.time,
      lastTime: line.time,
      lastErrorTime: line.error === null ? -Infinity : line.time,
    };
  }
  const next = { ...tally, runs: tally.runs + 1 };
  if (line.status === 'retry') next.retries += 1;
  if (line.time < next.firstTime) {
    next.firstTime = line.time;
    next.firstAt = line.at;
  }
  if (line.time >= next.lastTime) {
    next.lastTime = line.time;
    next.lastAt = line.at;
    next.lastStatus = line.status;
    next.owner = line.owner;
  }
  if (line.error !== null && line.time >= next.lastErrorTime) {
    next.lastErrorTime = line.time;
    next.lastError = line.error;
  }
  return next;
}

export function digestNight(text: string): Night {
  const tallies = new Map<string, Tally>();
  let badLines = 0;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines += 1;
      continue;
    }
    tallies.set(line.job, tallyLine(tallies.get(line.job), line));
  }
  const rows = [...tallies.values()]
    .map(({ firstTime, lastTime, lastErrorTime, ...row }): DigestRow => row)
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { rows, badLines };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
  return digestNight(text);
};
