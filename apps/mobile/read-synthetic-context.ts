import { contextPacketSchema } from '@health-coach/health-core/lab-context';
import type { SyntheticContextScenario } from '@health-coach/health-core/lab-context';
import { supabase } from './supabase-client';

export async function readSyntheticContext(scenario: SyntheticContextScenario) {
  if (!__DEV__) throw new Error('The synthetic example is available only in development.');
  const serverUrl = process.env.EXPO_PUBLIC_HEALTH_COACH_API_URL;
  if (!serverUrl || !/^https?:\/\//.test(serverUrl))
    throw new Error('Configure the Health Coach server URL to inspect the synthetic example.');
  const session = await supabase?.auth.getSession();
  if (!session?.data.session) throw new Error('Sign in again before loading the synthetic example.');
  const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/lab-context/synthetic?scenario=${scenario}`, {
    headers: { Authorization: `Bearer ${session.data.session.access_token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000)
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'The synthetic evidence could not be loaded.'
    );
  }
  const result = contextPacketSchema.safeParse(body);
  if (!result.success) throw new Error('The synthetic evidence response could not be verified.');
  return result.data;
}
