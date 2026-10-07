/**
 * The API returns SQL timestamps: "2026-10-07 16:39:26" (SQLite, UTC) or
 * "2026-10-07 16:39:26.129456+00" (Postgres). Normalise them to ISO 8601.
 */
export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  let iso = String(value).trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  if (/[+-]\d{2}$/.test(iso)) iso += ':00';
  else if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(iso)) iso += 'Z';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const relativeFormatter = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

export function formatDate(value) {
  const date = parseDate(value);
  return date ? dateFormatter.format(date) : '—';
}

export function formatDateTime(value) {
  const date = parseDate(value);
  return date ? dateTimeFormatter.format(date) : '—';
}

export function formatRelative(value) {
  const date = parseDate(value);
  if (!date) return 'Jamais';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [
    ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relativeFormatter.format(Math.round(seconds / size), unit);
  }
  return 'à l’instant';
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count > 1 ? plural : singular}`;
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Stable, pleasant avatar colour derived from a string.
export function avatarColor(seed = '') {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return `hsl(${hash} 45% 46%)`;
}

export function generatePassword(length = 14) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (v) => alphabet[v % alphabet.length]).join('');
}
