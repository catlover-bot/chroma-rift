/** Diagnostics contain authored scene coordinates, counters and bounded logs.
 * Do not copy process/env/native identifiers into this document. */
export function boundedDiagnosticText(value: unknown, maxLength = 1600): string {
  return String(value ?? '')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s)]+/gi, '[url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/[A-Z]:[\\/]Users[\\/][^\\/\s]+/gi, '[user]')
    .replace(/\/home\/[^/\s]+/g, '[user]')
    .replace(/\/Users\/[^/\s]+/g, '[user]')
    .replace(/\/var\/mobile\/[^\s)]+/g, '[device-path]')
    .replace(/\b(?:Bearer|token|api[_-]?key)\s*[:= ]\s*[^\s,;]+/gi, '[credential]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[identifier]')
    .slice(0, maxLength);
}
