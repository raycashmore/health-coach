import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { parseGatewayKey, runPrivateCommand } from './private-command.mjs';
import {
  projectRoot,
  readEnvironment,
  requireLocalSupabase,
  writePrivateEnvironment
} from './development-environment.mjs';
import { createDevelopmentGatewayKey } from './setup-ai-gateway.mjs';
import {
  checkMobileConfiguration,
  checkOwnerAuthentication,
  probeService,
  selectDevice
} from './phone-development.mjs';
import { runModelSmoke } from './smoke-wearable-model.mjs';
import { latestOpenAIModels } from './list-gateway-models.mjs';
import { containsRecognizableCredential, sourceFileContainsCredential } from './check-public-secrets.mjs';

test('command failures and malformed credential output never enter thrown errors', () => {
  const secret = 'SENSITIVE_TEST_SENTINEL';
  assert.throws(
    () =>
      runPrivateCommand(process.execPath, [
        '-e',
        `process.stdout.write('${secret}');process.stderr.write('${secret}');process.exit(1)`
      ]),
    (error) => !String(error).includes(secret)
  );
  assert.throws(
    () => parseGatewayKey(`{"token":"${secret}"`),
    (error) => !String(error).includes(secret)
  );
  assert.equal(parseGatewayKey('vck_example_fixture\n'), 'vck_example_fixture');
});

test('key creation preserves existing credentials and saves a bounded new key without returning it', () => {
  let calls = 0;
  assert.throws(
    () =>
      createDevelopmentGatewayKey('example-team', {
        read: () => ({ AI_GATEWAY_API_KEY: 'existing-fixture' }),
        run: () => {
          calls++;
        }
      }),
    /already configured/
  );
  assert.equal(calls, 0);
  let saved;
  const result = createDevelopmentGatewayKey('example-team', {
    read: () => ({}),
    run: (command, args) => {
      assert.equal(command, 'vercel');
      assert.ok(args.join(' ').includes('--limit 1 --refresh-period none --expiration 7d'));
      return 'vck_example_fixture';
    },
    save: (_path, values) => {
      saved = values;
    }
  });
  assert.equal(result, undefined);
  assert.deepEqual(saved, { AI_GATEWAY_API_KEY: 'vck_example_fixture' });
});

test('private environment updates round-trip literal values, preserve existing configuration and use restrictive permissions', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'health-coach-tooling-'));
  try {
    const path = resolve(directory, '.env.local');
    writeFileSync(path, 'EXISTING=preserved\nPASSWORD=old\n');
    writePrivateEnvironment(path, { PASSWORD: 'literal $value # with "quotes"', NEW_KEY: 'fixture' });
    assert.equal(readEnvironment(path).PASSWORD, 'literal $value # with "quotes"');
    assert.equal(readEnvironment(path).EXISTING, 'preserved');
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal((readFileSync(path, 'utf8').match(/^PASSWORD=/gm) ?? []).length, 1);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('phone tools reject remote targets, ambiguous devices, unauthorized phones and stale emulator configuration', () => {
  const web = {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture',
    LOCAL_OWNER_PASSWORD: 'fixture'
  };
  assert.doesNotThrow(() => requireLocalSupabase(web));
  assert.throws(
    () => requireLocalSupabase({ ...web, NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid' }),
    /remote targets/
  );
  assert.throws(() => selectDevice('List of devices attached\n'), /Connect one/);
  assert.throws(() => selectDevice('List of devices attached\nfixture-a\tdevice\nfixture-b\tdevice\n'), /Connect one/);
  assert.throws(() => selectDevice('List of devices attached\nfixture-a\tunauthorized\n'), /Unlock/);
  assert.equal(
    selectDevice('List of devices attached\nfixture-a\tdevice\nfixture-b\tdevice\n', 'fixture-b'),
    'fixture-b'
  );
  assert.throws(
    () => checkMobileConfiguration(web, { EXPO_PUBLIC_SUPABASE_URL: 'http://10.0.2.2:54321' }),
    /does not match/
  );
});

test('the Expo loader preserves a literal dollar-containing prefill in the injected child environment', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'health-coach-expo-env-'));
  try {
    const path = resolve(directory, '.env.local');
    const password = 'fixture $literal # with "quotes"';
    writePrivateEnvironment(path, { EXPO_PUBLIC_LOCAL_OWNER_PASSWORD: password });
    const systemEnv = { NODE_ENV: 'development', ...readEnvironment(path) };
    const requireExpo = createRequire(realpathSync(resolve(projectRoot, 'apps/mobile/node_modules/expo/package.json')));
    const { loadProjectEnv } = requireExpo('@expo/env');
    loadProjectEnv(directory, { mode: 'development', silent: true, systemEnv });
    assert.equal(systemEnv.EXPO_PUBLIC_LOCAL_OWNER_PASSWORD, password);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('runtime checks distinguish wrong services, unreachable ports and invalid owner credentials', async () => {
  assert.equal(
    await probeService(
      'http://example.invalid',
      (r) => r.status === 405,
      async () => new Response('', { status: 404 })
    ),
    'unexpected'
  );
  assert.equal(
    await probeService(
      'http://example.invalid',
      (r) => r.ok,
      async () => {
        throw new Error('private-network-detail');
      }
    ),
    'unreachable'
  );
  assert.equal(
    await checkOwnerAuthentication({ LOCAL_OWNER_PASSWORD: 'fixture' }, async () => new Response('', { status: 400 })),
    false
  );
  assert.equal(
    await checkOwnerAuthentication({ LOCAL_OWNER_PASSWORD: 'fixture' }, async () => new Response('', { status: 200 })),
    true
  );
});

test('model smoke requires explicit paid opt-in and returns only metadata from synthetic evidence', async () => {
  let calls = 0;
  const generate = async (input) => {
    calls++;
    assert.equal(input.evidence[0].recentMean, 5000);
    return { explanation: { observation: 'PRIVATE_OUTPUT_SENTINEL' }, inputTokens: 10, outputTokens: 20, elapsedMs: 1 };
  };
  await assert.rejects(() => runModelSmoke({ allowPaid: false, model: 'example/model', generate }), /--allow-paid/);
  assert.equal(calls, 0);
  const report = await runModelSmoke({ allowPaid: true, model: 'example/model', generate });
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(report).includes('PRIVATE_OUTPUT_SENTINEL'), false);
});

test('catalog discovery considers release order rather than a hard-coded shortlist', () => {
  const models = latestOpenAIModels([
    { id: 'openai/older', type: 'language', released: 1 },
    { id: 'other/newest', type: 'language', released: 10 },
    { id: 'openai/current', type: 'language', released: 5 }
  ]);
  assert.deepEqual(
    models.map((model) => model.id),
    ['openai/current', 'openai/older']
  );
});

test('public-content checks catch recognizable key material while allowing short placeholders', () => {
  assert.equal(containsRecognizableCredential('AI_GATEWAY_API_KEY=your-private-key'), false);
  assert.equal(containsRecognizableCredential('vck_example_fixture'), false);
  assert.equal(containsRecognizableCredential('vck_' + 'x'.repeat(48)), true);
  assert.equal(containsRecognizableCredential('sk-proj-' + 'x'.repeat(48)), true);
  assert.equal(containsRecognizableCredential(['-----BEGIN', 'PRIVATE KEY-----'].join(' ')), true);
});

test('source scanning skips symlinks into private files outside the scanned directory', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'health-coach-symlink-'));
  try {
    const privateFile = resolve(directory, 'private-fixture');
    const publicDirectory = resolve(directory, 'source');
    mkdirSync(publicDirectory);
    writeFileSync(privateFile, 'vck_' + 'x'.repeat(48));
    const link = resolve(publicDirectory, 'linked-file');
    symlinkSync(privateFile, link);
    assert.equal(sourceFileContainsCredential(privateFile), true);
    assert.equal(sourceFileContainsCredential(link), false);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
