import { parseIScreenJson } from '@health-coach/health-core/i-screen-json';
import { NextResponse } from 'next/server';

import { importIScreenReport } from '../../../../lib/import-i-screen-report';

export const runtime = 'nodejs';

const maximumUploadBytes = 5 * 1024 * 1024;

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  let jsonBytes: Uint8Array | undefined;
  let sourceText = '';
  let stage = 'reading the upload';

  try {
    const formData = await request.formData();
    const uploadedFile = formData.get('report');

    if (!(uploadedFile instanceof File) || uploadedFile.type !== 'application/json') {
      return errorResponse('Choose an I-Screen JSON export to import.', 400);
    }

    if (uploadedFile.size === 0 || uploadedFile.size > maximumUploadBytes) {
      return errorResponse('The export must be a JSON file smaller than 5 MB.', 400);
    }

    jsonBytes = new Uint8Array(await uploadedFile.arrayBuffer());

    sourceText = new TextDecoder().decode(jsonBytes);

    try {
      const imported = parseIScreenJson(JSON.parse(sourceText));
      stage = 'saving normalized observations';
      const receipt = await importIScreenReport(imported.observations);

      return NextResponse.json({ ...receipt, ignoredObservationCount: imported.ignoredObservationCount });
    } catch (error) {
      if (error instanceof SyntaxError) {
        return errorResponse('Choose a valid I-Screen JSON export to import.', 400);
      }

      throw error;
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith('The I-Screen JSON') || error.message.startsWith('The file is')) {
        return errorResponse(error.message, 422);
      }

      if (error.message.startsWith('Unable to') || error.message.startsWith('The server is missing')) {
        console.error(`I-Screen import failed: ${error.message}`);
        return errorResponse(error.message, 500);
      }
    }

    const errorType = error instanceof Error ? error.name : typeof error;
    console.error(`I-Screen import failed unexpectedly while ${stage}; error type: ${errorType}.`);
    return errorResponse('The report could not be imported. No source file was retained.', 500);
  } finally {
    sourceText = '';
    if (jsonBytes && jsonBytes.byteLength > 0) {
      jsonBytes.fill(0);
    }
  }
}
