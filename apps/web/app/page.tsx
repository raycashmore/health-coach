import { sourceKinds } from '@health-coach/health-core';

export default function IntakeHome() {
  return (
    <main>
      <p className="status">Foundation ready</p>
      <h1>Private health-data intake</h1>
      <p>
        This small web surface will accept source files from the owner&apos;s laptop, normalise them into the Personal
        Health Record, then discard the originals.
      </p>
      <p>Supported intake sources: {sourceKinds.slice(0, 2).join(' and ')}.</p>
    </main>
  );
}
