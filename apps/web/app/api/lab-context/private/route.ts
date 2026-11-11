import { createClient } from '@supabase/supabase-js';
import { loadPrivateContextPacket, privateContextBodySchema } from '../../../../lib/lab-context/private-packet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const maxBodyBytes = 16 * 1024;

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readBody(request: Request) {
  if (Number(request.headers.get('content-length')) > maxBodyBytes) throw new Error('body-too-large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid-body');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBodyBytes) {
        await reader.cancel();
        throw new Error('body-too-large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return privateContextBodySchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}

export async function POST(request: Request) {
  const path = process.env.HEALTH_COACH_PRIVATE_CASE_PATH;
  if (process.env.NODE_ENV !== 'development' || !path) return reply({ error: 'Not found.' }, 404);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const configuredOwner = process.env.HEALTH_RECORD_OWNER_ID;
  if (!url || !serviceKey || !configuredOwner) return reply({ error: 'Owner authentication is not configured.' }, 503);
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return reply({ error: 'Sign in to inspect the private case.' }, 401);
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let identity;
  try {
    identity = await client.auth.getUser(token);
  } catch {
    return reply({ error: 'Owner sign-in could not be verified. Try again.' }, 503);
  }
  const owner = identity.data.user;
  if (identity.error || !owner || owner.id !== configuredOwner) return reply({ error: 'Owner access required.' }, 401);
  if (new URL(request.url).search)
    return reply({ error: 'The private case accepts only a bounded activity snapshot.' }, 400);
  let body;
  try {
    body = await readBody(request);
  } catch {
    return reply({ error: 'The private case accepts only a bounded activity snapshot.' }, 400);
  }
  try {
    return reply(await loadPrivateContextPacket(owner.id, path, body.activity));
  } catch {
    return reply(
      { error: 'The prepared private case or its sources could not be verified. Prepare the current sources again.' },
      503
    );
  }
}
