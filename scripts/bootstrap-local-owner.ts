import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

const localEnvironmentPath = resolve(process.cwd(), 'apps/web/.env.local');
const localOwnerEmail = 'owner@local.invalid';

function localOwnerPassword(): string {
  const password = process.env.LOCAL_OWNER_PASSWORD;

  if (!password) {
    throw new Error('LOCAL_OWNER_PASSWORD must be set in apps/web/.env.local before bootstrapping the local owner.');
  }

  return password;
}

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
  const password = localOwnerPassword();
  const { data: existingUsers, error: usersError } = await client.auth.admin.listUsers();

  if (usersError) {
    throw new Error(`Unable to inspect local auth users: ${usersError.message}`);
  }

  const existingOwner = existingUsers.users.find((user) => user.email === localOwnerEmail);
  const { data: ownerResult, error: ownerError } = existingOwner
    ? await client.auth.admin.updateUserById(existingOwner.id, { password })
    : await client.auth.admin.createUser({
        email: localOwnerEmail,
        password,
        email_confirm: true
      });

  if (ownerError || !ownerResult.user) {
    throw new Error(`Unable to configure the local health-record owner: ${ownerError?.message ?? 'no user returned'}`);
  }

  const environmentContents = await readFile(localEnvironmentPath, 'utf8');
  await writeFile(localEnvironmentPath, withOwnerId(environmentContents, ownerResult.user.id));
  console.log('Local health-record owner is ready for sign-in.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unable to configure the local health-record owner.';
  console.error(message);
  process.exitCode = 1;
});
