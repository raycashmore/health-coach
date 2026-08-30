# Personal Health Agent

A single-user advisory system that turns the owner's longitudinal health data into timely, explainable recommendations while leaving every action under the owner's control.

## Language

**Advisory Health Agent**:
An agent that can recommend health actions and explain their evidence, uncertainty, and counter-signals, but cannot carry out those actions without explicit approval.
_Avoid_: Health coach, autonomous health agent

**Durable**:
Able to analyse on a schedule, retain relevant history, notice newly available data, and follow up on earlier recommendations without requiring a fresh prompt.
_Avoid_: Persistent, always-on

**Health Review**:
A broad scan across available personal health data that ranks which topics, changes, or anomalies deserve attention.
_Avoid_: Health check, daily diagnosis

**Health Investigation**:
A focused examination of one topic, initiated by the agent or owner, that gathers relevant personal data and outside evidence before producing recommendations. The agent may initiate it in the background and only surface the outcome when it warrants attention.
_Avoid_: Deep dive, diagnosis

**Daily Guidance**:
Secondary, short-horizon advice based mainly on recent activity, recovery, blood pressure, and adherence data, presented in the same conversational experience as longer-term health findings.
_Avoid_: Daily diagnosis, workout plan

**Health Insight**:
A non-obvious, personally relevant connection across multiple health sources that may change understanding or action; it is not a generic recommendation or a restatement of one source.
_Avoid_: Tip, observation, fun fact

**Health Insight Candidate**:
A provisional possible cross-source connection generated for verification and ranking. It is not shown as a Health Insight until it has passed the evidence, freshness, counter-signal, and deduplication checks.
_Avoid_: Insight, alert, finding

**Material Change**:
New evidence that changes the conclusion, urgency, or next action of an existing durable agent conclusion enough to justify revisiting it.
_Avoid_: Recalculation, refresh

**Insight Alert**:
A proactive notification that a meaningful new Health Insight is ready to investigate; it is exceptional rather than a routine daily briefing.
_Avoid_: Daily briefing, notification

**Health Follow-up**:
A tracked future action that refreshes health evidence or revisits an approved recommendation, such as a test, measurement, donation, or review, with an explained due window and lifecycle state. It may be completed by a matching source-backed result or an owner report, then replaced by its next recurrence where relevant.
_Avoid_: Reminder, task, appointment

**Superseded Health Follow-up**:
A visible inactive Health Follow-up that a newer finding has replaced because its timing or purpose is no longer right. It explains the replacement rather than silently disappearing.
_Avoid_: Deleted reminder, historical task

**Personal Health Record**:
The canonical collection of source-backed health data, optional personal context, active regimens, and durable agent conclusions used to understand the owner over time.
_Avoid_: Medical record, data lake

**Health Observation**:
A source-backed measurement or event tied to a point or period in time, such as a lab result, blood-pressure reading, sleep record, or exercise session.
_Avoid_: Fact, metric

**Genetic Variant**:
A source-backed record of the owner's called genotype at an identified genomic position. It is raw personal evidence that may inform a Genetic Topic Panel, not an interpretation or diagnosis.
_Avoid_: Genetic result, genetic finding

**Provider Interpretation**:
An attributed claim, explanation, or recommendation extracted from a third-party health or genetic report. It is source material to weigh against independent evidence, not a canonical Health Observation or a confirmed conclusion.
_Avoid_: Genetic fact, diagnosis, verified finding

**Source Metadata**:
Lightweight provenance retained with health data to identify its provider or origin, relevant source identifier, observed time, import time, and verification state after the source file itself is discarded.
_Avoid_: Audit trail, source artefact

**Source Coverage**:
The record of which health-data types a source currently provides, the period they cover, and when that source last synchronized successfully.
_Avoid_: Connection status, data availability

**Health Profile**:
Optional, manually maintained context such as medications, known conditions, allergies, family history, and health goals. Several goals or concerns may coexist; they can rank relevant investigations higher without suppressing stronger findings.
_Avoid_: Onboarding questionnaire, patient chart

**Supplement Regimen**:
The intended ingredient, form, dose, frequency, and active period for a supplement; it is a plan and is not evidence that each dose was taken.
_Avoid_: Supplement adherence, intake log

**Derived Health Summary**:
A replaceable calculation over source-backed health data, such as a daily activity total or resting-heart-rate trend; it is not a durable agent conclusion.
_Avoid_: Health Insight, observation

**Private Evaluation Snapshot**:
An access-controlled, versioned record of selected model inputs, outputs, evidence references, and owner judgement used to evaluate the agent. It is part of the private product record, not a general system log.
_Avoid_: Trace, prompt log

**Evaluation Case**:
A private, versioned real-data scenario with relevant source references, an expected quality or safety outcome, and owner judgement used to assess the Advisory Health Agent.
_Avoid_: Test patient, synthetic scenario, prompt example

**Operational Trace**:
Safe execution metadata—such as workflow, model and prompt versions, evidence identifiers, timing, status, and error category—used to operate and debug the system without copying health content into general logs.
_Avoid_: Audit record, evaluation dataset

**Genetically Informed Personalisation**:
The use of genetic associations as hypotheses that are weighed alongside labs, observed trends, and other personal context rather than treated as deterministic conclusions.
_Avoid_: Genetic diagnosis, DNA optimisation

**Genetic Topic Panel**:
A curated, versioned set of genetic associations for one health topic that the agent uses to begin a background Health Investigation. It is not an open-ended interpretation of the full genotype set.
_Avoid_: DNA score, genetic screening

**Worth-checking Genetic Lead**:
A visible, provisional Health Investigation result in which a genetic association is potentially relevant but Personal Corroboration is missing or stale. It explains the association, the missing evidence, and the most useful next measurement without claiming a condition or deterministic risk.
_Avoid_: Genetic diagnosis, health insight

**Personal Corroboration**:
The case-specific degree to which the owner's other health data supports, weakens, or contextualises a possible finding; it is distinct from the quality of the genetic or external evidence itself.
_Avoid_: Proof, confirmation score

**Health Experiment**:
A bounded, explicitly exploratory change with a hypothesis, baseline, outcome measures, review date, and stop conditions. It is only active after the owner explicitly starts it; beforehand it is a recommendation. It preferably isolates one variable but may combine variables when justified.
_Avoid_: Recommendation, trial

**Risk Tier**:
A classification of a recommendation by potential harm that determines the depth of its explanation, warnings, confirmation context, and escalation behaviour. It calibrates how a recommendation is presented; it does not suppress the agent's recommendation.
_Avoid_: Confidence score, severity
