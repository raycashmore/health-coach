# Iron-regulation Genetic Topic Panel — evidence and safety note

**Panel version:** 1.0  
**Status:** initial curated association; suitable only for a bounded Health
Investigation  
**Evidence reviewed:** 31 August 2026

## Purpose and non-diagnostic boundary

This panel may identify one narrowly defined _HFE_ genotype as a reason to
consider whether existing iron studies provide useful corroboration. It does
not screen the genome, diagnose haemochromatosis or iron overload, estimate an
individual's probability of disease, recommend treatment, or advise changes to
iron, vitamin C, alcohol, diet, blood donation, or phlebotomy.

The result must be phrased as a genetic association that may be worth checking
with a clinician, not as a condition, a finding of iron overload, or a
deterministic risk. A genotype is not enough: _HFE_ p.Cys282Tyr has low and
age- and sex-dependent clinical penetrance, and clinical assessment combines
genotype with biochemical and phenotypic evidence. [EASL Clinical Practice
Guidelines on haemochromatosis (2022)](https://easl.eu/wp-content/uploads/2022/06/PIIS01688278220021121.pdf)
and [CDC's hereditary haemochromatosis overview](https://www.cdc.gov/hereditary-hemochromatosis/about/index.html)
both state that many people with the relevant inherited changes do not develop
symptoms or complications.

## Curated genetic premise

The sole eligible association in version 1.0 is **homozygosity for the
alternate allele** at _HFE_ **NM_000410.4:c.845G>A (p.Cys282Tyr; C282Y;
rs1800562)**. The recorded genomic coordinates are GRCh38 chr6:26092913 and
GRCh37 chr6:26093141. ClinVar identifies this as Variation ID 9 and reports a
germline classification of pathogenic/pathogenic, low penetrance; risk factor,
with multiple submitters and no conflicts. [ClinVar
VCV000000009.145](https://www.ncbi.nlm.nih.gov/clinvar/variation/9/)

This selection is deliberately narrower than a general _HFE_ panel. EASL
states that p.Cys282Tyr homozygosity is the principal genotype in
HFE-haemochromatosis. It describes p.His63Asp (H63D) testing as a special-case,
controversial assessment that is not generally suggested to guide treatment.
Accordingly, version 1.0 must not create a lead for C282Y heterozygosity,
H63D heterozygosity or homozygosity, C282Y/H63D compound heterozygosity,
S65C, unphased calls, or any other _HFE_ or iron-related gene. Those are out
of scope rather than negative or reassuring results. [EASL (2022)](https://easl.eu/wp-content/uploads/2022/06/PIIS01688278220021121.pdf)

The panel must require a source-backed, unambiguous biallelic C282Y call whose
reference assembly and quality status are known. It must not infer the
genotype from a provider interpretation, ancestry, a polygenic score, or a
missing/partial call. Direct-to-consumer (DTC) data may be retained as a
source-backed raw observation, but it is insufficient for a medical conclusion:
the National Library of Medicine says DTC results generally require additional
healthcare-provider-ordered testing before they are diagnostic or used for
medical decisions. [MedlinePlus Genetics: DTC testing limitations](https://medlineplus.gov/genetics/understanding/dtcgenetictesting/dtcknow/)

## Required personal context

The investigation retrieves only:

- the eligible genetic call and its source/quality metadata;
- the most recent source-backed transferrin saturation (TSAT) and serum
  ferritin, including their dates and laboratory reference ranges;
- a known first-degree family history of clinically confirmed
  haemochromatosis, if the owner has voluntarily recorded it; and
- applicable counter-signals or alternative explanations already supported by
  the record, without trying to establish any of them.

The most useful missing corroboration is a clinician-directed iron study that
includes TSAT and ferritin. EASL uses both measures as the first diagnostic
step. Its guideline describes biochemical evidence of iron overload for
individuals of European origin as TSAT above 45% with ferritin above 200
micrograms/L for females, or TSAT above 50% with ferritin above 300
micrograms/L for males and postmenopausal women; it also recognises otherwise
unexplained persistently elevated TSAT. These are clinical guideline
thresholds, not application targets, diagnoses, or instructions to
self-test. [EASL (2022)](https://easl.eu/wp-content/uploads/2022/06/PIIS01688278220021121.pdf)

Normal or non-elevated recent TSAT and ferritin weaken the immediate case for
an iron-overload concern, but do not rule out every cause of symptoms or every
iron disorder. Elevated ferritin without the corresponding pattern is also
not sufficient corroboration: EASL notes that common non-genetic explanations
for raised ferritin include alcohol use, inflammation, liver-cell injury,
malignancy, non-alcoholic fatty liver disease, and metabolic syndrome. The
panel must present these as reasons for clinical interpretation, never choose
one as the explanation. [EASL (2022)](https://easl.eu/wp-content/uploads/2022/06/PIIS01688278220021121.pdf)

The evidence base and guideline thresholds do not generalise evenly across
ancestries, age groups, and sexes. The panel must not use ancestry as a proxy
for genotype or use a fixed penetrance percentage in owner-facing text.

## The only allowable panel result routes

| Route                           | Entry condition                                                                                                                                | Permitted outcome                                                                                                                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No genetic lead**             | A validated call is not C282Y homozygous, or no eligible call is available.                                                                    | Record no panel-generated result. Do not label the owner negative, low risk, or cleared.                                                                                                                                     |
| **Data-quality follow-up**      | The apparent call is DTC-only, unphased/ambiguous, lacks assembly or quality metadata, or otherwise cannot meet the curated premise.           | Explain that it cannot be used for a medical conclusion and suggest discussing clinically validated confirmation with a healthcare professional if the owner wants it assessed. No risk statement or treatment advice.       |
| **Worth-checking Genetic Lead** | The curated premise is met, but TSAT and ferritin are unavailable or do not both provide the context needed for interpretation.                | Explain the association and uncertainty; identify TSAT and ferritin as the useful missing corroboration; suggest a clinician discussion. This is the sole route that may use the visible term _Worth-checking Genetic Lead_. |
| **Clinician-review prompt**     | The curated premise is met and available data show the EASL biochemical pattern above, or persistently elevated TSAT is already source-backed. | State that the combination merits clinical review and confirmation; do not call it haemochromatosis, iron overload, or a diagnosis, and do not recommend a treatment.                                                        |
| **No current panel escalation** | The curated premise is met and recent TSAT and ferritin do not show the guideline biochemical pattern.                                         | State that the available iron markers do not currently corroborate this limited genetic lead. Do not schedule repeat testing, claim absence of disease, or generate lifestyle/treatment advice.                              |

Any symptoms, markedly abnormal laboratory result, or concern outside these
routes belongs to the ordinary clinical/laboratory safety workflow, not this
genetic panel. The panel must not suppress that workflow.

## Implementation guardrails

- Retain the panel version and the cited source identifiers with every derived
  lead so it can be re-evaluated when evidence changes.
- Keep owner-facing language conditional: “may be relevant”, “does not by
  itself establish”, and “discuss with a clinician”.
- Do not present urgency levels, diagnoses, medication/supplement changes,
  blood donation/phlebotomy, or treatment targets.
- Do not test or surface relatives' data. A recorded family history may add
  context, but can neither establish the genotype nor alter the result route.
- Treat a missing variant call as missing coverage, never as reference
  homozygosity.

## Source record

1. European Association for the Study of the Liver. _EASL Clinical Practice
   Guidelines on haemochromatosis_. Journal of Hepatology. 2022;77:479-502.
   [Official guideline PDF](https://easl.eu/wp-content/uploads/2022/06/PIIS01688278220021121.pdf).
2. National Center for Biotechnology Information. _ClinVar:
   NM_000410.4(HFE):c.845G>A (p.Cys282Tyr)_, VCV000000009.145.
   [ClinVar record](https://www.ncbi.nlm.nih.gov/clinvar/variation/9/).
3. Centers for Disease Control and Prevention. _About Hereditary
   Hemochromatosis_. Updated 7 April 2026.
   [CDC page](https://www.cdc.gov/hereditary-hemochromatosis/about/index.html).
4. National Library of Medicine. _What should I know before proceeding with
   direct-to-consumer genetic testing?_ Updated 2 June 2026.
   [MedlinePlus Genetics page](https://medlineplus.gov/genetics/understanding/dtcgenetictesting/dtcknow/).
