/** Reviewed public deployment identifiers, never credentials or an authentication boundary. */
export const STAGING_DEPLOYMENT_TARGET = Object.freeze({
  deployment_key: 'morrovia-staging-v1', environment: 'staging', verification_version: 1,
  database_name: 'morrovia_staging',
  endpoint_host: 'ep-fancy-credit-ar0ithc8.c-4.us-west-2.aws.neon.tech',
  project_id: 'frosty-mode-70756654', branch_id: 'br-lingering-sunset-arw7uok8',
});
export const STAGING_METADATA_QUERY = `select current_database() as connected_database,
  deployment_key,environment,verification_version,database_name,endpoint_host,project_id,branch_id,verification_reference,verified_at
  from public.morrovia_deployment_metadata where deployment_key='morrovia-staging-v1'`;
export const STAGING_METADATA_SQL_PREDICATE = `current_database()='morrovia_staging' and exists
  (select 1 from public.morrovia_deployment_metadata where deployment_key='morrovia-staging-v1'
   and environment='staging' and verification_version=1 and database_name='morrovia_staging'
   and endpoint_host='ep-fancy-credit-ar0ithc8.c-4.us-west-2.aws.neon.tech'
   and project_id='frosty-mode-70756654' and branch_id='br-lingering-sunset-arw7uok8'
   and verification_reference ~ '^[-a-zA-Z0-9_:]{4,120}$' and verified_at<=clock_timestamp())`;

/** Reject before connecting. URI query parameters must not override the checked route or TLS. */
export function assertStagingConnectionTarget(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    const direct = STAGING_DEPLOYMENT_TARGET.endpoint_host;
    const pooled = direct.replace('.c-4.', '-pooler.c-4.');
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || ![direct, pooled].includes(url.hostname) || (url.port && url.port !== '5432')
      || decodeURIComponent(url.pathname.slice(1)) !== STAGING_DEPLOYMENT_TARGET.database_name || url.hash
      || [...url.searchParams.keys()].some(key => !['sslmode', 'channel_binding', 'connect_timeout', 'application_name'].includes(key))
      || new Set(url.searchParams.keys()).size !== [...url.searchParams.keys()].length
      || !['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '')
      || ![null, 'require', 'prefer'].includes(url.searchParams.get('channel_binding'))) throw new Error();
    return STAGING_DEPLOYMENT_TARGET;
  } catch { throw new Error('Verified staging connection required'); }
}

/** Missing/changed metadata is unavailable, never a cache miss or permission to use another target. */
export function assertStagingDeploymentMetadata(rows, now = Date.now()) {
  const row = rows.length === 1 ? rows[0] : undefined;
  const verified = Date.parse(String(row?.verified_at));
  if (!row || row.connected_database !== STAGING_DEPLOYMENT_TARGET.database_name
    || Object.entries(STAGING_DEPLOYMENT_TARGET).some(([key, value]) => row[key] !== value)
    || typeof row.verification_reference !== 'string' || !/^[-a-zA-Z0-9_:]{4,120}$/.test(row.verification_reference)
    || !Number.isFinite(verified) || verified > now) throw new Error('Verified staging deployment metadata required');
}
