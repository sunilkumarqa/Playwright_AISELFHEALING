const MAX_TEXT = 80;

const SENSITIVE_QUERY_KEYS =
  /(token|auth|key|secret|password|passwd|pwd|session|sid|code|sig|signature|credential|email|user|otp|jwt)/i;

/**
 * Normalise and scrub free text taken from the DOM before it leaves the process.
 * Strips emails, long digit runs (card/phone/account numbers) and token-like strings.
 */
export function sanitizeText(value: string | null | undefined, max = MAX_TEXT): string | null {
  if (value == null) return null;
  let text = value.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  text = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b(?:eyJ[\w-]+\.){1,2}[\w-]*/g, '[token]')
    .replace(/\b[A-Za-z0-9_\-]{32,}\b/g, '[token]')
    .replace(/\d[\d\s-]{5,}\d/g, '[number]');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Remove credentials, hash and sensitive query parameter values from a URL. */
export function sanitizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.test(key)) url.searchParams.set(key, 'REDACTED');
    }
    return url.toString();
  } catch {
    return 'about:invalid-url';
  }
}

/** First line of an error message, without Playwright's call log (which may echo filled values). */
export function summarizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split('\n').find((line) => line.trim()) ?? 'Unknown error';
  return firstLine.replace(/\u001b\[[0-9;]*m/g, '').slice(0, 300);
}
