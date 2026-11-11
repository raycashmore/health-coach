import { createClient } from '@supabase/supabase-js';
import { syntheticContextScenarioSchema } from '@health-coach/health-core/lab-context';
import { loadSyntheticContextPacket } from '../../../../lib/lab-context/synthetic-packet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') return reply({ error: 'Not found.' }, 404);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const configuredOwner = process.env.HEALTH_RECORD_OWNER_ID;
  if (!url || !serviceKey || !configuredOwner) return reply({ error: 'Owner authentication is not configured.' }, 503);
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return reply({ error: 'Sign in to inspect the synthetic example.' }, 401);
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let identity;
  try {
    identity = await client.auth.getUser(token);
  } catch {
    return reply({ error: 'Owner sign-in could not be verified. Try again.' }, 503);
  }
  const owner = identity.data.user;
  if (identity.error || !owner || owner.id !== configuredOwner) return reply({ error: 'Owner access required.' }, 401);
  const params = new URL(request.url).searchParams;
  const scenario = syntheticContextScenarioSchema.safeParse(params.get('scenario') ?? 'prepared');
  if (!scenario.success || [...params.keys()].some((key) => key !== 'scenario'))
    return reply({ error: 'Choose an available synthetic example.' }, 400);
  try {
    return reply(await loadSyntheticContextPacket(owner.id, scenario.data));
  } catch {
    return reply({ error: 'The synthetic evidence packet could not be verified.' }, 503);
  }
}
