/** Temporary, explicit staging qualification scope. Default CI remains strict. */
export function isStagingAfricaLatencyException(area: string, width: number, tripType: string,
  environment: Record<string, string | undefined> = process.env): boolean {
  return environment.MORROVIA_STAGING_AFRICA_LATENCY_EXCEPTION === '1'
    && environment.GITHUB_ACTIONS === 'true'
    && ['staging', 'codex/staging-africa-latency-exception'].includes(environment.GITHUB_REF_NAME ?? '')
    && area === 'Africa'
    && ((width === 1440 && tripType === 'return_to_start') || (width === 390 && tripType === 'one_way'));
}
