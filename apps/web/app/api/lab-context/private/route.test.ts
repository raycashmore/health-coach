import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), load: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('../../../../lib/lab-context/private-packet', async (original) => {
  const actual = await original<typeof import('../../../../lib/lab-context/private-packet')>();
  return { ...actual, loadPrivateContextPacket: mocks.load };
});
import { POST } from './route';
const ownerId = '00000000-0000-4000-8000-000000000001';
function request(body: unknown = { activity: null }, authenticated = true, query = '') {
  return new Request(`http://localhost/api/lab-context/private${query}`, {
    method: 'POST',
    headers: authenticated ? { authorization: 'Bearer test-only' } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('HEALTH_COACH_PRIVATE_CASE_PATH', '/tmp/generic-case.json');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  vi.stubEnv('HEALTH_RECORD_OWNER_ID', ownerId);
  mocks.getUser.mockResolvedValue({ data: { user: { id: ownerId } }, error: null });
  mocks.load.mockResolvedValue({ kind: 'private-context' });
});
afterEach(() => vi.unstubAllEnvs());

it('is absent in production or without a configured case, before owner/source work', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  expect((await POST(request())).status).toBe(404);
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('HEALTH_COACH_PRIVATE_CASE_PATH', '');
  expect((await POST(request())).status).toBe(404);
  expect(mocks.getUser).not.toHaveBeenCalled();
  expect(mocks.load).not.toHaveBeenCalled();
});
it('rejects missing, invalid, non-owner and unavailable sessions before loading private evidence', async () => {
  expect((await POST(request(undefined, false))).status).toBe(401);
  mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'other-owner' } }, error: null });
  expect((await POST(request())).status).toBe(401);
  mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'invalid' } });
  expect((await POST(request())).status).toBe(401);
  mocks.getUser.mockRejectedValueOnce(new Error('PRIVATE_SENTINEL'));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('PRIVATE_SENTINEL');
  expect(mocks.load).not.toHaveBeenCalled();
});
it('accepts only bounded activity, using verified ownership and the configured path with no cache', async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(mocks.load).toHaveBeenCalledExactlyOnceWith(ownerId, '/tmp/generic-case.json', null);
  expect(mocks.getUser).toHaveBeenCalledWith('test-only');
});
it('rejects caller ownership, source paths, dates, panels, notes, malformed and oversized requests', async () => {
  for (const body of [
    { activity: null, ownerId },
    { activity: null, path: '/tmp/other.json' },
    { activity: null, asOf: '2026-01-01T00:00:00Z' },
    { activity: null, panels: [] },
    { activity: null, notes: [] },
    { activity: { days: [] } },
    'bad-json',
    ' '.repeat(16 * 1024 + 1)
  ])
    expect((await POST(request(body))).status).toBe(400);
  expect((await POST(request(undefined, true, '?path=other'))).status).toBe(400);
  const tooManyDays = {
    id: ownerId,
    timeZone: 'UTC',
    days: Array.from({ length: 15 }, (_, index) => ({
      date: `2026-01-${String(index + 1).padStart(2, '0')}`,
      steps: null,
      sleepMinutes: null
    }))
  };
  expect((await POST(request({ activity: tooManyDays }))).status).toBe(400);
  expect(mocks.load).not.toHaveBeenCalled();
});
it('keeps private details out of source failure responses', async () => {
  mocks.load.mockRejectedValueOnce(new Error('PRIVATE_SENTINEL'));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('PRIVATE_SENTINEL');
});
