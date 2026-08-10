import "server-only";

import { neon } from "@neondatabase/serverless";

export function getEasyTDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("EasyT persistence is not configured. Add DATABASE_URL to .env.local.");
  }
  return neon(databaseUrl);
}
