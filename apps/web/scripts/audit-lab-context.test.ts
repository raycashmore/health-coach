import { describe, expect, it } from 'vitest';
import { auditContextReceipt } from './audit-lab-context';
import type { LangfuseReader } from './langfuse-reader';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const traceId = 'a'.repeat(32),
  rootId = 'b'.repeat(16),
  projectId = 'project-example';
function fixture() {
  const trace = {
    caseId: '00000000-0000-4000-8000-000000000001',
    corpusRevision: '00000000-0000-4000-8000-000000000002',
    version: 'lab-context-v1',
    modelId: 'test/fake',
    reasoning: 'medium',
    inputTokens: 100,
    outputTokens: 20,
    noteCount: 1,
    omittedNotes: 0,
    estimatedGenerationUsd: null
  };
  const values = { requiredPassageRecall: 1, irrelevantSections: 0, citationValidity: 1 };
  const receipt = {
    liveReceipt: { projectId, baseUrl: 'https://us.cloud.langfuse.com', observation: { traceId, spanId: rootId } },
    reports: [{ trace, scores: values }]
  };
  const metadata = {
    caseId: trace.caseId,
    corpusRevision: trace.corpusRevision,
    version: trace.version,
    modelId: trace.modelId,
    reasoning: trace.reasoning,
    delivery: 'original',
    'scope.name': 'health-coach-lab-context',
    'scope.version': '1',
    'resourceAttributes.service.name': 'health-coach-lab-context'
  };
  const observations = ['lab-context-answer', 'structured-read', 'notes-search', 'answer-generation'].map(
    (name, i) => ({
      id: i === 0 ? rootId : String(i).repeat(16),
      traceId,
      projectId,
      name,
      type: ['CHAIN', 'TOOL', 'RETRIEVER', 'GENERATION'][i],
      parentObservationId: i === 0 ? null : rootId,
      input: null as unknown,
      output: null as unknown,
      environment: 'lab-context-experiment',
      version: null as string | null,
      tags: [] as string[],
      release: null as string | null,
      traceName: 'lab-context-answer',
      metadata: {
        ...metadata,
        ...(i === 0 ? { status: 'complete', failure: 'none', noteCount: 1, omittedNotes: 0 } : {})
      } as Record<string, unknown>,
      model: i === 3 ? trace.modelId : '',
      modelParameters: (i === 3 ? { reasoning: 'medium' } : {}) as Record<string, unknown>,
      usageDetails: i === 3 ? { input: 100, output: 20, total: 120 } : {},
      costDetails: {}
    })
  );
  const scores = Object.entries(values).map(([name, value]) => ({
    projectId,
    name,
    value,
    dataType: 'NUMERIC',
    comment: null as string | null,
    subject: { kind: 'observation', id: rootId, traceId }
  }));
  return { receipt, observations, scores };
}
function reader(data: ReturnType<typeof fixture>, oldRows: unknown[] = []): LangfuseReader {
  return {
    verifyProject: async (id) => {
      if (id !== projectId) throw new Error('langfuse-project-mismatch');
    },
    observations: async (id) => (id === traceId ? data.observations : oldRows),
    scores: async (id) => (id === traceId ? data.scores : [])
  };
}
describe('saved lab-context receipt audit', () => {
  it('runs the documented CLI against a saved receipt using only a local stub executable', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'context-audit-'));
    const data = fixture();
    const report = path.join(directory, 'report.json'),
      keys = path.join(directory, 'keys.env');
    await writeFile(report, JSON.stringify(data.receipt));
    await writeFile(keys, 'LANGFUSE_PUBLIC_KEY=pk-lf-example\nLANGFUSE_SECRET_KEY=sk-lf-example\n', { mode: 0o600 });
    const responses = path.join(directory, 'responses.json');
    await writeFile(responses, JSON.stringify(data));
    await writeFile(
      path.join(directory, 'npx'),
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2), api = args.indexOf('api');
if (api < 0 || args[api+2] !== 'list') process.exit(1);
const data = JSON.parse(fs.readFileSync(process.env.AUDIT_FIXTURE));
const resource = args[api+1];
const rows = resource === 'projects' ? [{id:'project-example'}] : data[resource];
if (!rows) process.exit(1);
console.log(JSON.stringify({status:200,body:{data:rows}}));
`,
      { mode: 0o700 }
    );
    try {
      const result = await promisify(execFile)(
        process.execPath,
        ['--import', 'tsx', fileURLToPath(new URL('./audit-lab-context-cli.mts', import.meta.url)), '--report', report],
        {
          env: {
            ...process.env,
            PATH: directory + path.delimiter + process.env.PATH,
            HC_LANGFUSE_KEYS_FILE: keys,
            AUDIT_FIXTURE: responses
          },
          timeout: 15000
        }
      );
      expect(JSON.parse(result.stdout)).toMatchObject({ status: 'passed', observationCount: 4, scoreCount: 3 });
      expect(result.stdout).not.toContain('sk-lf-example');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('passes matching metadata-only observations, hierarchy, usage and scores', async () => {
    const data = fixture();
    expect(await auditContextReceipt(data.receipt, reader(data))).toEqual({
      status: 'passed',
      observationCount: 4,
      scoreCount: 3,
      deletion: 'not-requested',
      failures: []
    });
  });
  it('rejects content anywhere in audited input, metadata or score comments without echoing it', async () => {
    const mutations = [
      (data: ReturnType<typeof fixture>) => {
        data.observations[0]!.input = 'PRIVATE-CONTENT-SENTINEL';
      },
      (data: ReturnType<typeof fixture>) => {
        data.observations[0]!.metadata['resourceAttributes.service.name'] = '/home/example/private';
      },
      (data: ReturnType<typeof fixture>) => {
        data.observations[0]!.metadata.extra = 'PRIVATE-CONTENT-SENTINEL';
      },
      (data: ReturnType<typeof fixture>) => {
        data.scores[0]!.comment = 'PRIVATE-CONTENT-SENTINEL';
      },
      (data: ReturnType<typeof fixture>) => {
        data.observations[2]!.modelParameters = { privateNote: 'PRIVATE-CONTENT-SENTINEL' };
      },
      (data: ReturnType<typeof fixture>) => {
        data.observations[1]!.model = 'PRIVATE-CONTENT-SENTINEL';
      },
      (data: ReturnType<typeof fixture>) => {
        data.observations[0]!.tags = ['PRIVATE-CONTENT-SENTINEL'];
      },
      (data: ReturnType<typeof fixture>) => {
        data.observations[0]!.release = 'PRIVATE-CONTENT-SENTINEL';
      },
      (data: ReturnType<typeof fixture>) => {
        data.observations[0]!.traceName = 'PRIVATE-CONTENT-SENTINEL';
      },
      (data: ReturnType<typeof fixture>) => {
        data.observations[0]!.version = 'PRIVATE-CONTENT-SENTINEL';
      },
      (data: ReturnType<typeof fixture>) => {
        data.observations[0]!.environment = 'PRIVATE-CONTENT-SENTINEL';
      }
    ];
    for (const mutate of mutations) {
      const data = fixture();
      mutate(data);
      const result = await auditContextReceipt(data.receipt, reader(data));
      expect(result.status).toBe('failed');
      expect(JSON.stringify(result)).not.toContain('PRIVATE-CONTENT-SENTINEL');
      expect(JSON.stringify(result)).not.toContain('/home/example');
    }
  });
  it('detects incorrect generation accounting, missing operations and wrong parents', async () => {
    const data = fixture();
    data.observations[3]!.usageDetails.input = 999;
    data.observations[1]!.parentObservationId = 'c'.repeat(16);
    data.observations.splice(2, 1);
    const result = await auditContextReceipt(data.receipt, reader(data));
    expect(result.failures).toEqual(
      expect.arrayContaining(['observation-count', 'observation-parent', 'generation-accounting'])
    );
  });
  it('reports deletion as pending until all old observations and scores are absent', async () => {
    const data = fixture();
    const receipt = {
      ...data.receipt,
      liveReceipt: { ...data.receipt.liveReceipt, previousRemoteTraceId: 'd'.repeat(32) }
    };
    expect((await auditContextReceipt(receipt, reader(data, [{ id: 'old-observation' }]))).status).toBe('pending');
    expect((await auditContextReceipt(receipt, reader(data))).deletion).toBe('complete');
  });
  it('verifies the project before reading any trace data', async () => {
    const data = fixture();
    let reads = 0;
    const access: LangfuseReader = {
      verifyProject: async () => {
        throw new Error('langfuse-project-mismatch');
      },
      observations: async () => {
        reads++;
        return [];
      },
      scores: async () => {
        reads++;
        return [];
      }
    };
    await expect(auditContextReceipt(data.receipt, access)).rejects.toThrow('langfuse-project-mismatch');
    expect(reads).toBe(0);
  });
});
