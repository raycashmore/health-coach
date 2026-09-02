import { createHash } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import {
  evaluateIronRegulationPanel,
  ironRegulationPanelId,
  ironRegulationPanelVersion
} from '@health-coach/health-core/iron-regulation-panel';
import type { IronRegulationInvestigationInput } from '@health-coach/health-core/iron-regulation-panel';

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

type IronStudy = {
  numeric_value: number;
  recorded_at: string;
  reference_range: string | null;
  source_id: string;
  test_name: string;
};

function inputFingerprint(variants: IronRegulationVariant[], studies: IronStudy[]): string {
  const variantInput = variants
    .map((variant) => `${variant.id}:${variant.genotype}:${variant.genome_build ?? 'unknown'}:${variant.source_id}`)
    .sort()
    .join('|');
  const studyInput = studies
    .map(
      (study) =>
        `${study.source_id}:${study.test_name}:${study.numeric_value}:${study.reference_range ?? 'unknown'}:${study.recorded_at}`
    )
    .sort()
    .join('|');

  return createHash('sha256').update(`${variantInput}|${studyInput}`).digest('hex');
}

function isFerritinStudy(study: IronStudy): boolean {
  return /ferritin/i.test(study.test_name);
}

function isTransferrinSaturationStudy(study: IronStudy): boolean {
  return /(?:transferrin\s*(?:saturation|sat\.?))|\btsat\b/i.test(study.test_name);
}

function mostRecentStudy(studies: IronStudy[], matches: (study: IronStudy) => boolean): IronStudy | undefined {
  return studies.filter(matches).sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))[0];
}

function referenceRangeUpperBound(referenceRange: string | null): number | undefined {
  if (!referenceRange) {
    return undefined;
  }

  const rangeMatch = referenceRange.match(/(?:-|≤)\s*(\d+(?:\.\d+)?)/);
  const parsed = rangeMatch?.[1] ? Number(rangeMatch[1]) : Number.NaN;

  return Number.isFinite(parsed) ? parsed : undefined;
}

function isAboveReferenceRange(study: IronStudy | undefined): boolean {
  const upperBound = study ? referenceRangeUpperBound(study.reference_range) : undefined;

  return upperBound !== undefined && study !== undefined && study.numeric_value > upperBound;
}

function ironStudyCorroboration(studies: IronStudy[]): IronRegulationInvestigationInput['ironStudyCorroboration'] {
  const ferritin = mostRecentStudy(studies, isFerritinStudy);
  const transferrinSaturation = mostRecentStudy(studies, isTransferrinSaturationStudy);
  const ferritinElevated = isAboveReferenceRange(ferritin);
  const transferrinSaturationElevated = isAboveReferenceRange(transferrinSaturation);

  if (ferritinElevated && transferrinSaturationElevated) {
    return 'both-elevated';
  }

  if (ferritinElevated) {
    return 'ferritin-elevated';
  }

  if (transferrinSaturationElevated) {
    return 'transferrin-saturation-elevated';
  }

  if (ferritin && transferrinSaturation) {
    return 'not-corrobating';
  }

  return 'missing';
}

function apparentC282YCall(
  variants: IronRegulationVariant[],
  isKnownDtcSource: boolean
): IronRegulationInvestigationInput['geneticCall'] {
  const genotypes = new Set(variants.map((variant) => variant.genotype));
  const genotype = genotypes.has('AA') ? 'AA' : genotypes.has('AG') || genotypes.has('GA') ? 'AG' : undefined;

  if (!genotype) {
    return { callState: 'unavailable' };
  }

  return {
    callState: genotypes.size === 1 && isKnownDtcSource ? 'dtc-only' : 'ambiguous',
    genotype
  };
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
  const isKnownDtcSource = eligibleVariants.every((variant) => {
    const source = sourceById.get(variant.source_id);

    return (
      source?.kind === 'genetic-export' &&
      source.provider === 'AncestryDNA' &&
      source.verification_state === 'parsed' &&
      Boolean(variant.genome_build)
    );
  });
  const [ferritinResult, transferrinSaturationResult] = await Promise.all([
    client
      .from('lab_results')
      .select('numeric_value, recorded_at, reference_range, source_id, test_name')
      .eq('owner_id', ownerId)
      .ilike('test_name', '%ferritin%')
      .order('recorded_at', { ascending: false })
      .limit(1),
    client
      .from('lab_results')
      .select('numeric_value, recorded_at, reference_range, source_id, test_name')
      .eq('owner_id', ownerId)
      .or('test_name.ilike.%transferrin saturation%,test_name.ilike.%tsat%')
      .order('recorded_at', { ascending: false })
      .limit(1)
  ]);

  if (ferritinResult.error || transferrinSaturationResult.error) {
    throw new Error('Unable to retrieve bounded iron-study observations.');
  }

  const eligibleStudies = [...(ferritinResult.data ?? []), ...(transferrinSaturationResult.data ?? [])] as IronStudy[];
  const result = evaluateIronRegulationPanel({
    geneticCall: apparentC282YCall(eligibleVariants, isKnownDtcSource),
    ironStudyCorroboration: ironStudyCorroboration(eligibleStudies)
  });

  const supersededAt = new Date().toISOString();

  if (result.resultType === 'no-genetic-lead') {
    const { error: supersedeError } = await client
      .from('health_investigations')
      .update({ superseded_at: supersededAt })
      .eq('owner_id', ownerId)
      .eq('panel_id', ironRegulationPanelId)
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
      input_fingerprint: inputFingerprint(eligibleVariants, eligibleStudies),
      owner_id: ownerId,
      panel_id: ironRegulationPanelId,
      panel_version: ironRegulationPanelVersion,
      personal_evidence_references: [
        ...new Set([...eligibleVariants, ...eligibleStudies].map((item) => item.source_id))
      ],
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
