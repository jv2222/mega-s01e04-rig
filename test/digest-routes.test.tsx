import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

type Body = { night: string; rows: { job: string; runs: number; retries: number; lastStatus: string }[]; badLines: number };

const goodLines = [
  '{"at":"2026-10-20T01:00:00+01:00","job":"b/two","status":"ok","owner":"sam"}',
  '{"at":"2026-10-20T01:05:00+01:00","job":"a/one","status":"ok","owner":"ana"}',
  '{"at":"2026-10-20T01:10:00+01:00","job":"b/two","status":"fail","owner":"sam","error":"disk full"}',
  '{"at":"2026-10-20T01:15:00+01:00","job":"a/one","status":"retry","owner":"ana","error":"timeout"}',
];

let dir: string;
let app: ReturnType<typeof createApp>;

function pageJobs(html: string): string[] {
  return [...html.matchAll(/<tr><td>([^<]+)<\/td>/g)].map((match) => match[1] ?? '');
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  writeFileSync(join(dir, '2026-10-20.jsonl'), `${goodLines.join('\n')}\n`);
  writeFileSync(join(dir, '2026-10-21.jsonl'), '');
  writeFileSync(join(dir, '2026-10-22.jsonl'), `${goodLines.join('\n')}\nnot json at all\n`);
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('digest page', () => {
  it('returns 200 and shows the jobs with their retry and fail marks', async () => {
    const res = await app.request('/digest/2026-10-20');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(pageJobs(html)).toEqual(['a/one', 'b/two']);
    expect(html).toContain('retry');
    expect(html).toContain('fail');
    expect(html).toContain('disk full');
  });

  it('returns 404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-10-19');
    expect(res.status).toBe(404);
  });

  it('renders nothing ran for an empty night', async () => {
    const res = await app.request('/digest/2026-10-21');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(pageJobs(html)).toEqual([]);
  });

  it('shows the could not be read note for a night with a bad line', async () => {
    const res = await app.request('/digest/2026-10-22');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(pageJobs(html)).toEqual(['a/one', 'b/two']);
    expect(html).toContain('1 line could not be read');
  });

  it('does not show the could not be read note for a clean night', async () => {
    const html = await (await app.request('/digest/2026-10-20')).text();
    expect(html).not.toContain('could not be read');
  });

  it('shows the lane marker and the five jobs of the real 2026-10-28 night', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const real = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' });
    const res = await real.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(pageJobs(html)).toEqual(['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
  });
});

describe('digest json', () => {
  it('returns 200 with the same jobs in the same order as the page', async () => {
    const res = await app.request('/api/digest/2026-10-20');
    const body = (await res.json()) as Body;
    const html = await (await app.request('/digest/2026-10-20')).text();
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-10-20');
    expect(body.rows.map((row) => row.job)).toEqual(pageJobs(html));
    expect(body.rows.map((row) => row.job)).toEqual(['a/one', 'b/two']);
    expect(body.rows.map((row) => row.lastStatus)).toEqual(['retry', 'fail']);
    expect(body.rows.map((row) => row.retries)).toEqual([1, 0]);
    expect(body.badLines).toBe(0);
  });

  it('returns 404 for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-10-19');
    expect(res.status).toBe(404);
  });

  it('returns 200 with no rows for an empty night', async () => {
    const res = await app.request('/api/digest/2026-10-21');
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('ignores a bad line in the rows and counts it in badLines', async () => {
    const res = await app.request('/api/digest/2026-10-22');
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.rows).toHaveLength(2);
    expect(body.badLines).toBe(1);
  });

  it('returns the five sorted jobs and one bad line for the real 2026-10-28 night', async () => {
    const real = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' });
    const res = await real.request('/api/digest/2026-10-28');
    const body = (await res.json()) as Body;
    const jobs = body.rows.map((row) => row.job);
    expect(res.status).toBe(200);
    expect(jobs).toHaveLength(5);
    expect(jobs).toEqual([...jobs].sort());
    expect(body.badLines).toBe(1);
  });
});
