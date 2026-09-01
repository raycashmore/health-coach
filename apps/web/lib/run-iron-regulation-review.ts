import { createHash } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import {
  evaluateIronRegulationPanel,
  ironRegulationPanelId,
  ironRegulationPanelVersion
} from '@health-coach/health-core/iron-regulation-panel';

type ReviewOutcome = 'not-applicable' | 'stored';

type IronRegulationVariant = {
  genome_build: 'GRCh37' | 'GRCh38' | null;
  genotype: string;
  id: string;
  source_id: string;
};

type HealthSource = {
  id: string;
  kind: string;
  provider: string;
  verification_state: string;
};

function inputFingerprint(variants: IronRegulationVariant[]): string {
  const input = variants
    .map((variant) => `${variant.id}:${variant.genotype}:${variant.genome_build ?? 'unknown'}:${variant.source_id}`)
    .sort()
    .join('|');

  return createHash('sha256').update(input).digest('hex');
}

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
    .select('genome_build, genotype, id, source_id')
    .eq('owner_id', ownerId)
    .eq('rsid', 'rs1800562');

  if (variantsError) {
    throw new Error('Unable to retrieve the bounded iron-regulation genetic call.');
  }

  const eligibleVariants = (variants ?? []) as IronRegulationVariant[];
  const sourceIds = [...new Set(eligibleVariants.map((variant) => variant.source_id))];
  const { data: sources, error: sourcesError } = await client
    .from('health_sources')
    .select('id, kind, provider, verification_state')
    .eq('owner_id', ownerId)
    .in('id', sourceIds);

  if (sourcesError) {
    throw new Error('Unable to retrieve source metadata for the bounded iron-regulation genetic call.');
  }

  const sourceById = new Map(((sources ?? []) as HealthSource[]).map((source) => [source.id, source]));
  const hasApparentC282YHomozygosity = eligibleVariants.some((variant) => variant.genotype === 'AA');
  const hasConflictingCall =
    hasApparentC282YHomozygosity && eligibleVariants.some((variant) => variant.genotype !== 'AA');
  const isKnownDtcSource = eligibleVariants.every((variant) => {
    const source = sourceById.get(variant.source_id);

    return (
      source?.kind === 'genetic-export' &&
      source.provider === 'AncestryDNA' &&
      source.verification_state === 'parsed' &&
      Boolean(variant.genome_build)
    );
  });
  const result = evaluateIronRegulationPanel({
    geneticCall: hasApparentC282YHomozygosity
      ? {
          callState: hasConflictingCall || !isKnownDtcSource ? 'ambiguous' : 'dtc-only',
          genotype: 'AA'
        }
      : { callState: 'unavailable' },
    ironStudyCorroboration: 'missing'
  });

  const supersededAt = new Date().toISOString();

  if (result.resultType === 'no-genetic-lead') {
    const { error: supersedeError } = await client
      .from('health_investigations')
      .update({ superseded_at: supersededAt })
      .eq('owner_id', ownerId)
      .eq('panel_id', ironRegulationPanelId)
      .eq('panel_version', ironRegulationPanelVersion)
      .is('superseded_at', null);

    if (supersedeError) {
      throw new Error('Unable to retire an inapplicable bounded iron-regulation review.');
    }

    return 'not-applicable';
  }

  const { error: supersedeError } = await client
    .from('health_investigations')
    .update({ superseded_at: supersededAt })
    .eq('owner_id', ownerId)
    .eq('panel_id', ironRegulationPanelId)
    .eq('panel_version', ironRegulationPanelVersion)
    .is('superseded_at', null);

  if (supersedeError) {
    throw new Error('Unable to retire a superseded bounded iron-regulation review.');
  }

  const { error: investigationError } = await client.from('health_investigations').upsert(
    {
      citation_references: [
        'EASL Clinical Practice Guidelines on haemochromatosis (2022)',
        'ClinVar VCV000000009.145',
        'MedlinePlus Genetics: DTC testing limitations'
      ],
      input_fingerprint: inputFingerprint(eligibleVariants),
      owner_id: ownerId,
      panel_id: ironRegulationPanelId,
      panel_version: ironRegulationPanelVersion,
      personal_evidence_references: [...new Set(eligibleVariants.map((variant) => variant.source_id))],
      result_type: result.resultType,
      summary: result.summary,
      superseded_at: null
    },
    { onConflict: 'owner_id,panel_id,panel_version,input_fingerprint' }
  );

  if (investigationError) {
    throw new Error('Unable to save the bounded iron-regulation review.');
  }

  return 'stored';
}
