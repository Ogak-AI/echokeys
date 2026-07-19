/** Sunday 00:00 UTC is the start of each competitive week. */

export function weekStartKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().split('T')[0]!;
}

export function previousWeekStartKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() - 7);
  return d.toISOString().split('T')[0]!;
}

/** Offset in whole weeks from the current week start (negative = past). */
export function weekStartWithOffset(offset: number, date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() + offset * 7);
  return d.toISOString().split('T')[0]!;
}

export function monthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Previous calendar month key (YYYY-MM). Used by the 1st-of-month snapshot job. */
export function previousMonthKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return monthKey(d);
}

export function yearKey(date = new Date()): string {
  return String(date.getUTCFullYear());
}

/** Previous calendar year. Used by the Jan 1 snapshot job. */
export function previousYearKey(date = new Date()): string {
  return String(date.getUTCFullYear() - 1);
}
