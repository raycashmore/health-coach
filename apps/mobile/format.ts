import type { WearableMetric } from './wearable-labels';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Hermes support for Intl options varies by device ICU; grouping is the only Intl feature relied on.
const grouped = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

function parts(date: string) {
  if (date.length > 10) {
    // Timestamps show the local calendar day they happened on, not their UTC date.
    const instant = new Date(date);
    return { year: instant.getFullYear(), month: months[instant.getMonth()]!, day: instant.getDate() };
  }
  const [year, month, day] = date.split('-').map(Number);
  return { year: year!, month: months[month! - 1]!, day: day! };
}

/** Formats a calendar date (YYYY-MM-DD) as is, or a timestamp by its local day. */
export function formatDate(date: string, currentYear = new Date().getFullYear()): string {
  const { year, month, day } = parts(date);
  return year === currentYear ? `${day} ${month}` : `${day} ${month} ${year}`;
}

export function formatDateRange(start: string, end: string, currentYear = new Date().getFullYear()): string {
  const from = parts(start);
  const to = parts(end);
  if (from.year !== to.year || from.year !== currentYear) {
    return `${formatDate(start, currentYear)} – ${formatDate(end, currentYear)}`;
  }
  return from.month === to.month
    ? `${from.day}–${to.day} ${to.month}`
    : `${from.day} ${from.month} – ${to.day} ${to.month}`;
}

export function formatTime(instant: Date): string {
  const hours = instant.getHours();
  const minutes = String(instant.getMinutes()).padStart(2, '0');
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function formatMagnitude(metric: WearableMetric, value: number): string {
  return metric === 'steps' ? grouped.format(value) : formatDuration(value);
}

export function formatMetric(metric: WearableMetric, value: number): string {
  return formatMagnitude(metric, Math.round(value));
}

export function formatChange(metric: WearableMetric, baseline: number, recent: number): string {
  // Derive the change from the displayed whole values so the row adds up.
  const change = Math.round(recent) - Math.round(baseline);
  if (change === 0) return '0';
  return `${change > 0 ? '+' : '−'}${formatMagnitude(metric, Math.abs(change))}`;
}
