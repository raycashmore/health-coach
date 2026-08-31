import 'server-only';

import { createClient } from '@supabase/supabase-js';
import {
  evaluateIronRegulationPanel,
  ironRegulationPanelId,
  ironRegulationPanelVersion
} from '@health-coach/health-core/iron-regulation-panel';

type ReviewOutcome = 'not-applicable' | 'stored';

function requiredEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`The server is missing ${name}.`);
  }

  return value;
}

export async function runIronRegulationReview(): Promise<ReviewOutcome> {
  const supabaseUrl = requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const ownerId = requiredEnvironment('HEALTH_RECORD_OWNER_ID');
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: variants, error: variantsError } = await client
    .from('genetic_variants')
    .select('genotype, id, source_id')
    .eq('owner_id', ownerId)
    .eq('rsid', 'rs1800562')
    .limit(1);

  if (variantsError) {
    throw new Error('Unable to retrieve the bounded iron-regulation genetic call.');
  }

  const variant = variants?.[0];
  const result = evaluateIronRegulationPanel({
    geneticCall: variant
      ? {
          callState: 'dtc-only',
          genotype: variant.genotype
        }
      : { callState: 'unavailable' },
    ironStudyCorroboration: 'missing'
  });

  if (result.resultType === 'no-genetic-lead') {
    return 'not-applicable';
  }

  const { error: investigationError } = await client.from('health_investigations').upsert(
    {
      citation_references: [
        'EASL Clinical Practice Guidelines on haemochromatosis (2022)',
        'ClinVar VCV000000009.145',
        'MedlinePlus Genetics: DTC testing limitations'
      ],
      input_fingerprint: variant?.id ?? 'no-eligible-c282y-call',
      owner_id: ownerId,
      panel_id: ironRegulationPanelId,
      panel_version: ironRegulationPanelVersion,
      personal_evidence_references: variant ? [variant.id] : [],
      result_type: result.resultType,
      summary: result.summary
    },
    { onConflict: 'owner_id,panel_id,panel_version,input_fingerprint' }
  );

  if (investigationError) {
    throw new Error('Unable to save the bounded iron-regulation review.');
  }

  return 'stored';
}
