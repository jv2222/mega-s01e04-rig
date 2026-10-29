import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links both nights on disk to their digest', async () => {
    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
  });

  it('counts retry as summed retries, fail as rows last failing, ok as runs minus both', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-'));
    writeFileSync(
      join(dir, '2026-01-01.jsonl'),
      [
        { at: '2026-01-01T01:00:00+01:00', job: 'a', status: 'ok' },
        { at: '2026-01-01T01:01:00+01:00', job: 'a', status: 'retry' },
        { at: '2026-01-01T01:02:00+01:00', job: 'a', status: 'ok' },
        { at: '2026-01-01T01:03:00+01:00', job: 'b', status: 'retry' },
        { at: '2026-01-01T01:04:00+01:00', job: 'b', status: 'fail' },
        { at: '2026-01-01T01:05:00+01:00', job: 'c', status: 'ok' },
      ]
        .map((l) => JSON.stringify(l))
        .join('\n'),
    );
    const html = await (await createApp({ ...config, runsDir: dir }).request('/')).text();
    expect(html).toContain('ok 3 · retry 2 · fail 1');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
