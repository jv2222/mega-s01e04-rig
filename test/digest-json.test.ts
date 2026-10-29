import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('digest json', () => {
  it('returns sorted rows and the bad line count for 2026-10-28', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-28');
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    const jobs = body.rows.map((row) => row.job);
    expect(res.status).toBe(200);
    expect(jobs).toHaveLength(5);
    expect(jobs).toEqual([...jobs].sort());
    expect(body.badLines).toBe(1);
  });
});
