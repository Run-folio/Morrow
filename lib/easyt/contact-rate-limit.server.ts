const CONTACT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;
const CONTACT_RATE_LIMIT_MAX_REQUESTS = 5;

export function createContactRateLimiter() {
  const attempts = new Map<string, { count: number; resetAt: number }>();
  return (key: string, now = Date.now()) => {
    if (attempts.size >= 1_000) {
      for (const [candidate, attempt] of attempts) {
        if (attempt.resetAt <= now) attempts.delete(candidate);
      }
      if (attempts.size >= 1_000) attempts.delete(attempts.keys().next().value as string);
    }
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + CONTACT_RATE_LIMIT_WINDOW_MS });
      return true;
    }
    if (current.count >= CONTACT_RATE_LIMIT_MAX_REQUESTS) return false;
    current.count += 1;
    return true;
  };
}

export const contactRateLimitAllows = createContactRateLimiter();
