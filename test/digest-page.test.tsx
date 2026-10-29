import { expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

it('renders the digest page for a night on disk', async () => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  const res = await createApp(config).request('/digest/2026-10-28');
  const html = await res.text();
  expect(res.status).toBe(200);
  expect(html).toContain('TEST-MARKER');
  for (const job of ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']) {
    expect(html).toContain(job);
  }
});
