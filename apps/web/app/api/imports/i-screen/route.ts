import { parseIScreenReport } from '@health-coach/health-core/i-screen-report';
import { NextResponse } from 'next/server';

import { importIScreenReport } from '../../../../lib/import-i-screen-report';

export const runtime = 'nodejs';

const maximumUploadBytes = 20 * 1024 * 1024;

type PdfTextItem = {
  page: number;
  text: string;
  x: number;
  y: number;
};

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

async function extractPdfTextItems(pdfBytes: Uint8Array): Promise<PdfTextItem[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const documentParameters: Parameters<typeof getDocument>[0] & { isEvalSupported: boolean } = {
    data: pdfBytes,
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false
  };
  const loadingTask = getDocument(documentParameters);

  try {
    const document = await loadingTask.promise;
    const items: PdfTextItem[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();

      for (const item of textContent.items) {
        if (!('str' in item) || typeof item.str !== 'string' || !('transform' in item)) {
          continue;
        }

        const transform = item.transform;

        if (!Array.isArray(transform) || typeof transform[4] !== 'number' || typeof transform[5] !== 'number') {
          continue;
        }

        items.push({ page: pageNumber, text: item.str, x: transform[4], y: transform[5] });
      }
    }

    return items;
  } finally {
    await loadingTask.destroy();
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let pdfBytes: Uint8Array | undefined;
  let stage = 'reading the upload';

  try {
    const formData = await request.formData();
    const uploadedFile = formData.get('report');

    if (!(uploadedFile instanceof File) || uploadedFile.type !== 'application/pdf') {
      return errorResponse('Choose an I-Screen PDF report to import.', 400);
    }

    if (uploadedFile.size === 0 || uploadedFile.size > maximumUploadBytes) {
      return errorResponse('The report must be a PDF smaller than 20 MB.', 400);
    }

    pdfBytes = new Uint8Array(await uploadedFile.arrayBuffer());

    if (String.fromCharCode(...pdfBytes.slice(0, 5)) !== '%PDF-') {
      return errorResponse('Choose a valid PDF report to import.', 400);
    }

    stage = 'extracting PDF text';
    const observations = parseIScreenReport(await extractPdfTextItems(pdfBytes));
    stage = 'saving normalized observations';
    const receipt = await importIScreenReport(observations);

    return NextResponse.json(receipt);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith('The I-Screen report')) {
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
    if (pdfBytes && pdfBytes.byteLength > 0) {
      pdfBytes.fill(0);
    }
  }
}
