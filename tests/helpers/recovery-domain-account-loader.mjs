import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = pathToFileURL(path.join(root, 'tests/helpers/recovery-domain-account-synthetic.ts')).href;
const empty = 'data:text/javascript,export {};';
const identityResolver = 'data:text/javascript,export async function resolveTripTransferJourneys(trip){return trip;}';
const forbiddenAuth = 'data:text/javascript,export function getEasyTAuthSecret(){throw new Error("Credential access forbidden in account qualification");}';

/** Always synthetic, regardless of inherited database/API environment modes. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { url: empty, shortCircuit: true };
  if (['pg', '@neondatabase/serverless', 'openai', 'better-auth'].includes(specifier)) {
    throw new Error('Live dependency forbidden in synthetic account qualification: ' + specifier);
  }
  const local = specifier.startsWith('@/') ? path.join(root, specifier.slice(2))
    : specifier.startsWith('.') && context.parentURL?.startsWith('file:') ? fileURLToPath(new URL(specifier, context.parentURL)) : null;
  if (local) {
    const extensionless = local.replace(/\.ts$/, '');
    if (['lib/easyt/database', 'lib/easyt/owner'].some(name => extensionless === path.join(root, name))) return { url: fixture, shortCircuit: true };
    if (extensionless === path.join(root, 'lib/easyt/auth-environment')) return { url: forbiddenAuth, shortCircuit: true };
    if (extensionless === path.join(root, 'lib/easyt/multimodal-transfer-resolution.server')) return { url: identityResolver, shortCircuit: true };
    for (const candidate of [local, local + '.ts', local + '.tsx', path.join(local, 'index.ts')]) {
      try { await access(candidate); return { url: pathToFileURL(candidate).href, shortCircuit: true }; } catch { /* Resolve the next local extension. */ }
    }
  }
  if (specifier === 'next/server') return nextResolve('next/server.js', context);
  return nextResolve(specifier, context);
}
