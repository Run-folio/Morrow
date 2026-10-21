/** Endpoint connectivity and generic timing do not establish a complete pair journey. */
export function isInsufficientTransferEvidence(kind: unknown): boolean {
  return typeof kind === 'string'
    && ['legacy_flight_estimate', 'airport_planning_allowance', 'direct_air_connectivity', 'direct_rail_connectivity', 'air_gateway_composition'].includes(kind);
}
