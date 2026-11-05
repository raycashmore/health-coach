import { createServer } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { contextSpanProcessor, operationalRecorder } from './telemetry';
import { runContextBaseline } from './run';
import { syntheticRequest, syntheticPublication, fakeContextModel } from '../../scripts/lab-context-fixtures';

const attributeSchema = z.object({ key: z.string(), value: z.record(z.string(), z.unknown()) });
const payloadSchema = z.object({
  resourceSpans: z.array(
    z.object({
      resource: z.object({ attributes: z.array(attributeSchema) }),
      scopeSpans: z.array(
        z.object({
          scope: z.object({ name: z.string(), version: z.string().optional() }).passthrough(),
          spans: z.array(
            z.object({
              name: z.string(),
              attributes: z.array(attributeSchema),
              events: z.array(z.unknown()).optional(),
              links: z.array(z.unknown()).optional(),
              traceState: z.string().optional(),
              status: z.object({ message: z.string().optional() }).optional()
            })
          )
        })
      )
    })
  )
});

describe('Langfuse outbound trace privacy', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('captures the real compressed OTLP payload, including SDK resources and scope', async () => {
    vi.stubEnv('LANGFUSE_RELEASE', 'PRIVATE-ENV-SENTINEL');
    vi.stubEnv('OTEL_SERVICE_NAME', 'PRIVATE-SERVICE-SENTINEL');
    vi.stubEnv('LANGFUSE_OTEL_COMPRESSION', 'gzip');
    const bodies: Buffer[] = [];
    const paths: string[] = [];
    const encodings: (string | undefined)[] = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        paths.push(request.url ?? '');
        encodings.push(request.headers['content-encoding']);
        bodies.push(
          request.headers['content-encoding'] === 'gzip' ? gunzipSync(Buffer.concat(chunks)) : Buffer.concat(chunks)
        );
        response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('loopback-server-unavailable');
    const recorder = operationalRecorder(
      contextSpanProcessor({
        baseUrl: `http://127.0.0.1:${address.port}`,
        publicKey: 'public-placeholder',
        secretKey: 'secret-placeholder'
      })
    );
    try {
      const request = syntheticRequest();
      request.question = 'PRIVATE-QUESTION-SENTINEL';
      request.panels[0]!.sourceId = 'PRIVATE-SOURCE-SENTINEL';
      const publication = syntheticPublication();
      publication.sections[0]!.headingPath = ['PRIVATE-HEADING-SENTINEL'];
      publication.sections[0]!.text = 'PRIVATE-NOTE-SENTINEL';
      const result = await runContextBaseline(request, {
        store: { search: async () => publication, isCurrent: async () => true },
        modelId: 'test/fake',
        model: fakeContextModel({
          findings: [{ text: 'PRIVATE-ANSWER-SENTINEL', evidenceIds: ['lab-1'] }],
          limitations: []
        }),
        record: async (trace) => {
          const extra = { ...trace, prompt: 'PRIVATE-EXTRA-SENTINEL' };
          await recorder.record(extra);
        }
      });
      expect(result.telemetry).toBe('recorded');
      expect(bodies.length).toBeGreaterThan(0);
      expect(paths.every((path) => path === '/api/public/otel/v1/traces')).toBe(true);
      expect(encodings.every((encoding) => encoding === 'gzip')).toBe(true);
      const wire = bodies.map((body) => body.toString('utf8')).join('');
      expect(wire).not.toContain('PRIVATE-');
      expect(wire).not.toContain(request.ownerId);
      expect(wire).not.toContain('Marker A');
      expect(wire).not.toContain('/Users/');
      expect(wire).not.toContain('/home/');
      const spans = [];
      for (const body of bodies) {
        for (const resource of payloadSchema.parse(JSON.parse(body.toString('utf8'))).resourceSpans) {
          expect(resource.resource.attributes.map((attribute) => attribute.key)).toEqual(['service.name']);
          expect(resource.resource.attributes.find((attribute) => attribute.key === 'service.name')?.value).toEqual({
            stringValue: 'health-coach-lab-context'
          });
          for (const scope of resource.scopeSpans) {
            expect(scope.scope).toMatchObject({ name: 'health-coach-lab-context', version: '1' });
            expect(
              Object.keys(scope.scope).every((key) =>
                ['name', 'version', 'attributes', 'droppedAttributesCount'].includes(key)
              )
            ).toBe(true);
            expect(scope.scope.attributes ?? []).toEqual([]);
            for (const span of scope.spans) {
              expect(span.events ?? []).toEqual([]);
              expect(span.links ?? []).toEqual([]);
              expect(span.traceState ?? '').toBe('');
              expect(span.status?.message ?? '').toBe('');
              expect(span.attributes.some((attribute) => /input$|output$|exception/.test(attribute.key))).toBe(false);
              spans.push(span);
            }
          }
        }
      }
      expect(spans.map((span) => span.name).sort()).toEqual([
        'answer-generation',
        'lab-context-answer',
        'notes-search',
        'structured-read'
      ]);
    } finally {
      try {
        await recorder.shutdown();
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    }
  });
});
