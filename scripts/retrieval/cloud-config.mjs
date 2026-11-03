import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

export const embeddingEndpoint = 'https://ai-gateway.vercel.sh/v1/embeddings';

export async function loadCloudCredentials(filename) {
  const values = parseEnv(await readFile(filename, 'utf8'));
  if (!values.AI_GATEWAY_API_KEY?.trim() || !values.SUPABASE_ACCESS_TOKEN?.trim())
    throw new Error('Set AI_GATEWAY_API_KEY and SUPABASE_ACCESS_TOKEN in the ignored credentials file');
  return { gatewayKey: values.AI_GATEWAY_API_KEY.trim(), managementToken: values.SUPABASE_ACCESS_TOKEN.trim() };
}

export function selectProject(projects, explicitReference) {
  const matches = explicitReference
    ? projects.filter((project) => project.id === explicitReference)
    : projects.filter((project) => /^health[ _-]?coach$/i.test(project.name));
  if (matches.length !== 1 || !/^[a-z]{20}$/.test(matches[0].id))
    throw new Error('Cannot uniquely identify Health Coach project; set verified HC_RETRIEVAL_PROJECT_REF');
  return matches[0].id;
}
