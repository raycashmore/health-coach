'use client';

import { useState } from 'react';

type ImportState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { count: number; kind: 'success'; periodEnd: string; periodStart: string };

export function IScreenUploadForm() {
  const [state, setState] = useState<ImportState>({ kind: 'idle' });

  async function handleSubmit(formData: FormData): Promise<void> {
    setState({ kind: 'submitting' });

    try {
      const response = await fetch('/api/imports/i-screen', { body: formData, method: 'POST' });
      const body: unknown = await response.json();

      if (!response.ok || !isImportReceipt(body)) {
        setState({ kind: 'error', message: isImportError(body) ? body.error : 'The report could not be imported.' });
        return;
      }

      setState({
        count: body.importedObservationCount,
        kind: 'success',
        periodEnd: body.periodEnd,
        periodStart: body.periodStart
      });
    } catch {
      setState({ kind: 'error', message: 'The report could not be imported.' });
    }
  }

  return (
    <section aria-labelledby="i-screen-upload-heading">
      <h2 id="i-screen-upload-heading">I-Screen lab report</h2>
      <p>Upload a PDF to retain normalized lab observations and source coverage. The original file is discarded.</p>
      <form action={handleSubmit}>
        <label htmlFor="i-screen-report">I-Screen PDF report</label>
        <input accept="application/pdf" id="i-screen-report" name="report" required type="file" />
        <button disabled={state.kind === 'submitting'} type="submit">
          {state.kind === 'submitting' ? 'Importing…' : 'Import report'}
        </button>
      </form>
      {state.kind === 'error' ? <p role="alert">{state.message}</p> : null}
      {state.kind === 'success' ? (
        <p role="status">
          Imported {state.count} lab observations covering {state.periodStart.slice(0, 10)} to{' '}
          {state.periodEnd.slice(0, 10)}. The source PDF was discarded.
        </p>
      ) : null}
    </section>
  );
}

function isImportError(value: unknown): value is { error: string } {
  return typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string';
}

function isImportReceipt(
  value: unknown
): value is { importedObservationCount: number; periodEnd: string; periodStart: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'importedObservationCount' in value &&
    typeof value.importedObservationCount === 'number' &&
    'periodStart' in value &&
    typeof value.periodStart === 'string' &&
    'periodEnd' in value &&
    typeof value.periodEnd === 'string'
  );
}
