export function getEasyTAuthSecret() {
  return process.env.BETTER_AUTH_SECRET || process.env.NEON_AUTH_COOKIE_SECRET;
}

export function isEasyTAuthConfigured() {
  return Boolean(process.env.DATABASE_URL && getEasyTAuthSecret());
}
