/**
 * Returns a human-readable relative time string from an ISO timestamp.
 * @param {string} isoString - ISO 8601 timestamp
 * @returns {string} Relative time string (e.g., "just now", "5 minutes ago")
 */
export function getRelativeTime(isoString) {
  if (!isoString) return '';
  const now = new Date();
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const diffMs = now - date;
  if (diffMs < 0) return 'just now';
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}
