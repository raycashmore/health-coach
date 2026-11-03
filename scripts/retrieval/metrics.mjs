export function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function scoreRetrieval(questions, results, limit) {
  const positive = questions.filter((q) => q.required.length);
  const required = positive.reduce((n, q) => n + q.required.length, 0);
  const found = positive.reduce((n, q) => {
    const docs = new Set(results[q.id].slice(0, limit).map((hit) => hit.document_id));
    return n + q.required.filter((id) => docs.has(id)).length;
  }, 0);
  return {
    requiredPassages: required,
    foundPassages: found,
    recall: found / required,
    perQuestion: questions.map((q) => ({
      id: q.id,
      kind: q.kind,
      split: q.split,
      required: q.required,
      returned: results[q.id].slice(0, limit).map((hit) => hit.document_id),
      // Missing-evidence queries have no relevant passage. Raw vector ranking
      // always yields neighbors; no abstention threshold is tuned in this run.
      relevant: results[q.id].slice(0, limit).filter((hit) => q.required.includes(hit.document_id)).length
    }))
  };
}

export function summarizeTimings(rows) {
  return Object.fromEntries(
    ['keyword', 'semantic', 'hybrid'].map((mode) => {
      const samples = rows.filter((row) => row.mode === mode);
      const warm = samples.filter((row) => row.repetition > 0);
      const stages = ['embeddingMs', 'searchRoundTripMs', 'databaseMs', 'fetchRoundTripMs', 'totalMs'];
      return [
        mode,
        {
          samples: samples.length,
          firstPass: samples.filter((r) => r.repetition === 0),
          warmSamples: warm.length,
          warm: Object.fromEntries(
            stages.map((stage) => [
              stage,
              {
                p50: percentile(
                  warm.map((r) => r[stage]),
                  0.5
                ),
                p95: percentile(
                  warm.map((r) => r[stage]),
                  0.95
                )
              }
            ])
          )
        }
      ];
    })
  );
}
