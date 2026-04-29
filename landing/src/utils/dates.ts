const TRIAL_DURATION_DAYS = 90;

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function trialEndDate(startDate: Date = new Date()): Date {
  return addDays(startDate, TRIAL_DURATION_DAYS);
}

export function isExpired(date: Date | null): boolean {
  if (!date) return true;
  return date < new Date();
}
