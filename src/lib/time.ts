export function toIsoUtc(value: string | Date): string {
  return new Date(value).toISOString();
}

export function addDays(value: string | Date, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function startOfDayUtc(value: string): string {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

export function endOfDayUtc(value: string): string {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date.toISOString();
}
