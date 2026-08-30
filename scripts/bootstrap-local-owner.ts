import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

const localEnvironmentPath = resolve(process.cwd(), 'apps/web/.env.local');
const localOwnerEmail = 'owner@local.invalid';

function requiredEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} must be configured after starting local Supabase.`);
  }

  return value;
}

function withOwnerId(environmentContents: string, ownerId: string): string {
  const ownerLine = `HEALTH_RECORD_OWNER_ID=${ownerId}`;

  if (/^HEALTH_RECORD_OWNER_ID=.*$/m.test(environmentContents)) {
    return environmentContents.replace(/^HEALTH_RECORD_OWNER_ID=.*$/m, ownerLine);
  }

  return `${environmentContents.trimEnd()}\n${ownerLine}\n`;
}

async function main(): Promise<void> {
  process.loadEnvFile(localEnvironmentPath);
  const client = createClient(
    requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data: existingUsers, error: usersError } = await client.auth.admin.listUsers();

  if (usersError) {
    throw new Error(`Unable to inspect local auth users: ${usersError.message}`);
  }

  const existingOwner = existingUsers.users.find((user) => user.email === localOwnerEmail);
  const { data: createdOwner, error: createError } = existingOwner
    ? { data: { user: existingOwner }, error: null }
    : await client.auth.admin.createUser({
        email: localOwnerEmail,
        password: crypto.randomUUID(),
        email_confirm: true
      });

  if (createError || !createdOwner.user) {
    throw new Error(`Unable to create the local health-record owner: ${createError?.message ?? 'no user returned'}`);
  }

  const environmentContents = await readFile(localEnvironmentPath, 'utf8');
  await writeFile(localEnvironmentPath, withOwnerId(environmentContents, createdOwner.user.id));
  console.log('Local health-record owner configured.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unable to configure the local health-record owner.';
  console.error(message);
  process.exitCode = 1;
});
