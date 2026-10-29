import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const tempDirs: string[] = [];

function tempRunsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  tempDirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads the 28 October night into one row per job, sorted by job', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((row) => row.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('tallies runs, retries, last status, last error and times with the log offset', () => {
    const rows = readNight('runs', '2026-10-28')?.rows ?? [];
    expect(rows.find((row) => row.job === 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(rows.find((row) => row.job === 'notes/backup')).toMatchObject({
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
    expect(rows.find((row) => row.job === 'lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });

  it('keeps a row whose owner is null', () => {
    const rows = readNight('runs', '2026-10-28')?.rows ?? [];
    expect(rows.find((row) => row.job === 'digest/render')).toMatchObject({ owner: null, lastError: null });
  });

  it('returns no rows and no bad lines for an empty file', () => {
    const dir = tempRunsDir({ '2026-10-30.jsonl': '' });
    expect(readNight(dir, '2026-10-30')).toEqual({ rows: [], badLines: 0 });
  });

  it('returns null when the night has no file', () => {
    const dir = tempRunsDir({});
    expect(readNight(dir, '2026-10-30')).toBeNull();
  });

  it('orders by the time in the log, not by line order', () => {
    const dir = tempRunsDir({
      '2026-10-30.jsonl': [
        '{"at":"2026-10-30T02:00:00+01:00","job":"a","status":"ok","owner":"x"}',
        '{"at":"2026-10-30T01:00:00+01:00","job":"a","status":"fail","owner":"x","error":"boom"}',
        '{"at":"2026-10-30T01:00:00+01:00","job":"a","status":"maybe","owner":"x"}',
      ].join('\n'),
    });
    expect(readNight(dir, '2026-10-30')).toEqual({
      rows: [
        {
          job: 'a',
          owner: 'x',
          runs: 2,
          retries: 0,
          lastStatus: 'ok',
          lastError: 'boom',
          firstAt: '2026-10-30T01:00:00+01:00',
          lastAt: '2026-10-30T02:00:00+01:00',
        },
      ],
      badLines: 1,
    });
  });
});
