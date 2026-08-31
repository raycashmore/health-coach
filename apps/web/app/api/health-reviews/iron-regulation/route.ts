import { NextResponse } from 'next/server';

import { runIronRegulationReview } from '../../../../lib/run-iron-regulation-review';

export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
  try {
    const outcome = await runIronRegulationReview();

    return NextResponse.json({ outcome });
  } catch {
    console.error('Iron-regulation Health Review failed.');
    return NextResponse.json({ error: 'The Health Review could not be completed.' }, { status: 500 });
  }
}
