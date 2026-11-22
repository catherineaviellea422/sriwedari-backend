export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

export function formatShortTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

export function formatDateOnly(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

export function computeHoldExpiresAt(holdMinutes = 1440): string {
  return new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();
}

export function isExpiredIso(isoString?: string): boolean {
  if (!isoString) return false;
  const ts = new Date(isoString).getTime();
  return Number.isFinite(ts) && Date.now() > ts;
}
