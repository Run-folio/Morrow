/** Temporary, explicit staging qualification scope. Default CI remains strict. */
export function isStagingAfricaLatencyException(area: string, width: number, tripType: string,
  environment: Record<string, string | undefined> = process.env): boolean {
  return environment.MORROVIA_STAGING_AFRICA_LATENCY_EXCEPTION === '1'
    && environment.GITHUB_ACTIONS === 'true'
    && ['staging', 'codex/staging-africa-latency-exception'].includes(environment.GITHUB_REF_NAME ?? '')
    && area === 'Africa'
    && ((width === 1440 && tripType === 'return_to_start') || (width === 390 && tripType === 'one_way'));
}

/** Only explicit owner-approved South Korea timing contexts; never functional checks. */
export function isStagingSouthKoreaLatencyException(area: string, width: number, tripType: string,
  environment: Record<string, string | undefined> = process.env): boolean {
  return environment.GITHUB_ACTIONS === 'true'
    && ['staging', 'codex/staging-africa-latency-exception'].includes(environment.GITHUB_REF_NAME ?? '')
    && area === 'South Korea'
    && ((environment.MORROVIA_STAGING_SOUTH_KOREA_LATENCY_EXCEPTION === '1' && width === 1440 && tripType === 'return_to_start')
      || (environment.MORROVIA_STAGING_SOUTH_KOREA_MOBILE_LATENCY_EXCEPTION === '1' && width === 390 && tripType === 'one_way'));
}
