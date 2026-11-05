import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { auditContextReceipt, auditReceiptSchema } from './audit-lab-context';
import { langfuseReader, readLangfuseAccess } from './langfuse-reader';

try {
  const args = process.argv.slice(2),
    keysFile = process.env.HC_LANGFUSE_KEYS_FILE;
  if (!keysFile) throw new Error('audit-configuration-required');
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--report')) throw new Error('audit-arguments-invalid');
  const filename =
    args[1] ?? fileURLToPath(new URL('../../../private-data/lab-context-live/report.json', import.meta.url));
  const content = await readFile(filename, 'utf8');
  if (Buffer.byteLength(content) > 5 * 1024 * 1024) throw new Error('audit-receipt-too-large');
  const receipt = auditReceiptSchema.parse(JSON.parse(content));
  const config = await readLangfuseAccess(keysFile);
  if (receipt.liveReceipt.baseUrl !== config.baseUrl) throw new Error('audit-destination-mismatch');
  const result = await auditContextReceipt(receipt, langfuseReader(config));
  console.log(JSON.stringify(result));
  process.exitCode = result.status === 'passed' ? 0 : result.status === 'pending' ? 2 : 1;
} catch (error) {
  const codes = new Set([
    'audit-configuration-required',
    'audit-arguments-invalid',
    'audit-receipt-too-large',
    'audit-destination-mismatch',
    'langfuse-read-failed',
    'langfuse-project-mismatch',
    'langfuse-cursor-repeated',
    'langfuse-audit-limit'
  ]);
  console.error(
    JSON.stringify({
      status: 'failed',
      reason: error instanceof Error && codes.has(error.message) ? error.message : 'audit-unavailable'
    })
  );
  process.exitCode = 1;
}
