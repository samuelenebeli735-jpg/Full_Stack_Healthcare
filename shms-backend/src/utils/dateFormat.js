/**
 * Human-readable date/time for user-facing text such as notifications,
 * e.g. "Tue, 6 Oct 2026, 10:00".
 *
 * It uses the server's local time zone, the same wall-clock interpretation
 * the scheduling and booking code uses (set TZ for the process, e.g.
 * TZ=Africa/Lagos). Stored timestamps stay in UTC; only the rendering
 * changes. Never show users a raw UTC ISO string.
 */
export function formatLocalDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
