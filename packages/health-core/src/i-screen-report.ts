const iScreenResultColumnStart = 440;
const iScreenReferenceRangeColumnStart = 340;
const iScreenReferenceRangeColumnEnd = 440;
const iScreenTestNameColumnEnd = 180;
const monthNumbers = {
  apr: 3,
  aug: 7,
  dec: 11,
  feb: 1,
  jan: 0,
  jul: 6,
  jun: 5,
  mar: 2,
  may: 4,
  nov: 10,
  oct: 9,
  sep: 8
} satisfies Record<string, number>;

function getMonthNumber(monthName: string): number | undefined {
  return Object.hasOwn(monthNumbers, monthName) ? monthNumbers[monthName as keyof typeof monthNumbers] : undefined;
}

export type IScreenTextItem = {
  page: number;
  text: string;
  x: number;
  y: number;
};

export type IScreenLabResult = {
  recordedAt: string;
  referenceRange?: string;
  testName: string;
  unit: string;
  value: number;
};

type ReportRow = {
  cells: IScreenTextItem[];
  page: number;
  y: number;
};

function parseCollectionDate(items: IScreenTextItem[]): string {
  const collectionDateItem = items.find((item) => /(?:sample|collection)\s+date/i.test(item.text));
  const writtenDateMatch = collectionDateItem?.text.match(/(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})/i);

  if (writtenDateMatch) {
    const day = writtenDateMatch[1];
    const monthName = writtenDateMatch[2]?.slice(0, 3).toLowerCase();
    const year = writtenDateMatch[3];
    const month = monthName ? getMonthNumber(monthName) : undefined;

    if (!day || !year || month === undefined) {
      throw new Error('The I-Screen report does not contain a valid collection date.');
    }

    const recordedAt = new Date(Date.UTC(Number(year), month, Number(day)));

    if (
      Number.isNaN(recordedAt.getTime()) ||
      recordedAt.getUTCFullYear() !== Number(year) ||
      recordedAt.getUTCMonth() !== month ||
      recordedAt.getUTCDate() !== Number(day)
    ) {
      throw new Error('The I-Screen report does not contain a valid collection date.');
    }

    return recordedAt.toISOString();
  }

  const match = collectionDateItem?.text.match(/(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})/);

  if (!match) {
    throw new Error('The I-Screen report does not contain a supported collection date.');
  }

  const first = match[1];
  const month = match[2];
  const last = match[3];

  if (!first || !month || !last) {
    throw new Error('The I-Screen report does not contain a valid collection date.');
  }

  const year = first.length === 4 ? first : last;
  const firstNumber = first.length === 4 ? Number(last) : Number(first);
  const secondNumber = Number(month);

  if (year.length !== 4 || (first.length !== 4 && first.length > 2) || firstNumber > 31 || secondNumber > 31) {
    throw new Error('The I-Screen report does not contain a valid collection date.');
  }

  const yearNumber = Number(year);
  const [monthNumber, dayNumber] =
    first.length === 4 || firstNumber > 12 ? [secondNumber, firstNumber] : [firstNumber, secondNumber];
  const recordedAt = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));

  if (
    Number.isNaN(recordedAt.getTime()) ||
    recordedAt.getUTCFullYear() !== yearNumber ||
    recordedAt.getUTCMonth() !== monthNumber - 1 ||
    recordedAt.getUTCDate() !== dayNumber
  ) {
    throw new Error('The I-Screen report does not contain a valid collection date.');
  }

  return recordedAt.toISOString();
}

function groupRows(items: IScreenTextItem[]): ReportRow[] {
  const rows = new Map<string, ReportRow>();

  for (const item of items) {
    const y = Math.round(item.y);
    const key = `${item.page}:${y}`;
    const row = rows.get(key) ?? { cells: [], page: item.page, y };
    row.cells.push(item);
    rows.set(key, row);
  }

  return [...rows.values()].map((row) => ({
    ...row,
    cells: row.cells.slice().sort((left, right) => left.x - right.x)
  }));
}

function parseResultCell(resultCell: string): { unit: string; value: number } | undefined {
  const match = resultCell.trim().match(/^([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s+(.+)$/);

  if (!match) {
    return undefined;
  }

  const numericValue = match[1];
  const unitValue = match[2];

  if (!numericValue || !unitValue) {
    return undefined;
  }

  const value = Number(numericValue.replace(/[<>≤≥\s]/g, '').replace(',', '.'));
  const unit = unitValue.trim();

  return Number.isFinite(value) && unit.length > 0 ? { value, unit } : undefined;
}

function parseLabResult(row: ReportRow, recordedAt: string): IScreenLabResult | undefined {
  const testName = row.cells.find((cell) => cell.x < iScreenTestNameColumnEnd)?.text.trim();
  const resultCell = row.cells.find((cell) => cell.x >= iScreenResultColumnStart)?.text;

  if (!testName || !resultCell) {
    return undefined;
  }

  const result = parseResultCell(resultCell);

  if (!result) {
    return undefined;
  }

  const referenceRange = row.cells
    .find((cell) => cell.x >= iScreenReferenceRangeColumnStart && cell.x < iScreenReferenceRangeColumnEnd)
    ?.text.trim();

  return {
    ...result,
    ...(referenceRange ? { referenceRange } : {}),
    recordedAt,
    testName: testName.replace(/\*+$/, '').trim()
  };
}

export function parseIScreenReport(items: IScreenTextItem[]): IScreenLabResult[] {
  const recordedAt = parseCollectionDate(items);
  const results = groupRows(items)
    .map((row) => parseLabResult(row, recordedAt))
    .filter((result): result is IScreenLabResult => result !== undefined);

  if (results.length === 0) {
    throw new Error('The I-Screen report does not contain supported lab results.');
  }

  return results;
}
