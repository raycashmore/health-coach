import { readFile, writeFile } from 'node:fs/promises';

const status = await readJsonFromStandardInput();
const requiredKeys = ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY'];

for (const key of requiredKeys) {
  if (typeof status[key] !== 'string' || status[key].length === 0) {
    throw new Error(`Local Supabase status is missing ${key}. Start the local stack first.`);
  }
}

const generatedEnvironmentKeys = new Set([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
]);
const environmentPath = new URL('../apps/web/.env.local', import.meta.url);
const existingContents = await readExistingEnvironment(environmentPath);
const preservedLines = existingContents
  .split('\n')
  .filter((line) => !generatedEnvironmentKeys.has(line.slice(0, line.indexOf('='))))
  .filter((line) => line.length > 0);
const contents = [
  `NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}`,
  `SUPABASE_SERVICE_ROLE_KEY=${status.SERVICE_ROLE_KEY}`,
  ...preservedLines,
  ''
].join('\n');

await writeFile(environmentPath, contents, 'utf8');
console.log('Wrote local Supabase environment variables for the web app.');

async function readExistingEnvironment(environmentPath) {
  try {
    return await readFile(environmentPath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}

async function readJsonFromStandardInput() {
  let input = '';

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  return JSON.parse(input);
}
