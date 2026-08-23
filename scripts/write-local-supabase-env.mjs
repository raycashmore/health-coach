import { writeFile } from 'node:fs/promises';

const status = await readJsonFromStandardInput();
const requiredKeys = ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY'];

for (const key of requiredKeys) {
  if (typeof status[key] !== 'string' || status[key].length === 0) {
    throw new Error(`Local Supabase status is missing ${key}. Start the local stack first.`);
  }
}

const contents = [
  `NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}`,
  `SUPABASE_SERVICE_ROLE_KEY=${status.SERVICE_ROLE_KEY}`,
  ''
].join('\n');

await writeFile(new URL('../apps/web/.env.local', import.meta.url), contents, 'utf8');
console.log('Wrote local Supabase environment variables for the web app.');

async function readJsonFromStandardInput() {
  let input = '';

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  return JSON.parse(input);
}
