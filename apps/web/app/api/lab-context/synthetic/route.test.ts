import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextPacketSchema } from '@health-coach/health-core/lab-context';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), load: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('../../../../lib/lab-context/synthetic-packet', async (original) => {
  const actual = await original<typeof import('../../../../lib/lab-context/synthetic-packet')>();
  return { ...actual, loadSyntheticContextPacket: mocks.load.mockImplementation(actual.loadSyntheticContextPacket) };
});
import { GET } from './route';
const ownerId = '00000000-0000-4000-8000-000000000001';
function request(query = '', authenticated = true) {
  return new Request(`http://localhost/api/lab-context/synthetic${query}`, {
    headers: authenticated ? { authorization: 'Bearer test-only' } : {}
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  vi.stubEnv('HEALTH_RECORD_OWNER_ID', ownerId);
  mocks.getUser.mockResolvedValue({ data: { user: { id: ownerId } }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe('synthetic context API boundary', () => {
  it('is absent outside development before auth or evidence work', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await GET(request())).status).toBe(404);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('rejects missing, invalid, non-owner and unavailable sign-in before fixture assembly', async () => {
    expect((await GET(request('', false))).status).toBe(401);
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'other-owner' } }, error: null });
    expect((await GET(request())).status).toBe(401);
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'invalid' } });
    expect((await GET(request())).status).toBe(401);
    mocks.getUser.mockRejectedValueOnce(new Error('PRIVATE_SENTINEL'));
    const unavailable = await GET(request());
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain('PRIVATE_SENTINEL');
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('derives fixture ownership from the verified session and returns a validated uncached packet', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(contextPacketSchema.safeParse(await response.json()).success).toBe(true);
    expect(mocks.getUser).toHaveBeenCalledWith('test-only');
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(ownerId, 'prepared');
  });
  it('rejects owner IDs, arbitrary scenario names and unknown source inputs', async () => {
    for (const query of ['?ownerId=other-owner', '?scenario=private', '?file=private-report', '?question=private']) {
      expect((await GET(request(query))).status).toBe(400);
    }
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('returns explicit partial packets for failed sources, stale notes and ambiguous dates', async () => {
    for (const [scenario, expected] of [
      ['notes-unavailable', { notes: { status: 'unavailable', sections: [] } }],
      ['stale-notes', { notes: { status: 'stale', sections: [] } }],
      ['activity-unavailable', { activityStatus: 'unavailable', windows: [] }],
      ['ambiguous-dates', { laboratoryStatus: 'ambiguous', panel: null }]
    ] as const) {
      const response = await GET(request(`?scenario=${scenario}`));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject(expected);
    }
  });
});
