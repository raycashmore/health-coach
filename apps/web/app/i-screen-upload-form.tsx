'use client';

import { useState } from 'react';

type ImportState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { count: number; ignoredCount: number; kind: 'success'; periodEnd: string; periodStart: string };

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
        ignoredCount: body.ignoredObservationCount,
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
      <h2 id="i-screen-upload-heading">I-Screen results export</h2>
      <p>
        Upload the intercepted JSON export to retain normalized lab observations and source coverage. The original file
        is discarded.
      </p>
      <form action={handleSubmit}>
        <label htmlFor="i-screen-report">I-Screen JSON export</label>
        <input accept="application/json" id="i-screen-report" name="report" required type="file" />
        <button disabled={state.kind === 'submitting'} type="submit">
          {state.kind === 'submitting' ? 'Importing…' : 'Import report'}
        </button>
      </form>
      {state.kind === 'error' ? <p role="alert">{state.message}</p> : null}
      {state.kind === 'success' ? (
        <p role="status">
          Imported {state.count} lab observations covering {state.periodStart.slice(0, 10)} to{' '}
          {state.periodEnd.slice(0, 10)}. {state.ignoredCount} unsupported observations were skipped. The source JSON
          was discarded.
        </p>
      ) : null}
    </section>
  );
}

function isImportError(value: unknown): value is { error: string } {
  return typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string';
}

function isImportReceipt(value: unknown): value is {
  ignoredObservationCount: number;
  importedObservationCount: number;
  periodEnd: string;
  periodStart: string;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'importedObservationCount' in value &&
    typeof value.importedObservationCount === 'number' &&
    'ignoredObservationCount' in value &&
    typeof value.ignoredObservationCount === 'number' &&
    'periodStart' in value &&
    typeof value.periodStart === 'string' &&
    'periodEnd' in value &&
    typeof value.periodEnd === 'string'
  );
}
