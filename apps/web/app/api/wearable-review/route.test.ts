import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  explain: vi.fn()
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from })
}));
vi.mock('../../../lib/explain-wearable-review', () => ({ explainWearableReview: mocks.explain }));
import { POST } from './route';
import { dateInZone, shiftDate } from '@health-coach/health-core/wearable-review';

function validRequest() {
  const now = new Date();
  const completedBefore = dateInZone(now, 'UTC');
  return new Request('http://localhost/api/wearable-review', {
    method: 'POST',
    headers: { authorization: 'Bearer test-only' },
    body: JSON.stringify({
      snapshot: {
        timeZone: 'UTC',
        completedBefore,
        syncedAt: now.toISOString(),
        days: Array.from({ length: 21 }, (_, index) => ({
          date: shiftDate(completedBefore, index - 21),
          steps: { value: 5000, origins: ['example.source'] },
          sleepMinutes: null
        }))
      }
    })
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  vi.stubEnv('HEALTH_RECORD_OWNER_ID', '00000000-0000-4000-8000-000000000001');
  vi.stubEnv('WEARABLE_AI_ENABLED', 'false');
});

describe('private wearable review access', () => {
  it('rejects missing credentials before parsing or storing health content', async () => {
    const response = await POST(new Request('http://localhost/api/wearable-review', { method: 'POST', body: '{}' }));
    expect(response.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.explain).not.toHaveBeenCalled();
  });
  it('rejects an authenticated account other than the configured owner', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'another-account' } }, error: null });
    const response = await POST(
      new Request('http://localhost/api/wearable-review', {
        method: 'POST',
        headers: { authorization: 'Bearer test-only' },
        body: '{}'
      })
    );
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects invalid snapshots without reserving a paid model run', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: process.env.HEALTH_RECORD_OWNER_ID } }, error: null });
    const response = await POST(
      new Request('http://localhost/api/wearable-review', {
        method: 'POST',
        headers: { authorization: 'Bearer test-only' },
        body: '{}'
      })
    );
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.explain).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('returns the comparison without storing or calling a model when AI is disabled', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: process.env.HEALTH_RECORD_OWNER_ID } }, error: null });
    const response = await POST(validRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind: 'baseline', analysis: { status: 'no-change' } });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.explain).not.toHaveBeenCalled();
  });
  it('does not make a second model call for an existing in-progress reservation', async () => {
    vi.stubEnv('WEARABLE_AI_ENABLED', 'true');
    vi.stubEnv('WEARABLE_REVIEW_MODEL', 'test/model');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-only');
    mocks.getUser.mockResolvedValue({ data: { user: { id: process.env.HEALTH_RECORD_OWNER_ID } }, error: null });
    mocks.rpc.mockResolvedValue({ data: 'example-review', error: null });
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { status: 'running', input_snapshot: { reservationKey: 'another-request' } },
            error: null
          })
        })
      })
    });
    expect((await POST(validRequest())).status).toBe(409);
    expect(mocks.explain).not.toHaveBeenCalled();
  });
});
