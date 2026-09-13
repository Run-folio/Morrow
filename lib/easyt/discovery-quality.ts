export type DiscoveryVisitorCandidate = {
  title: string;
  category?: string;
  tags?: readonly string[];
  description?: string;
  qualityScore?: number;
  kind?: "activity" | "restaurant" | "tour";
};

const administrativeEntity = /\b(?:administrative|administration|government office|municipal office|city hall|county|province|electoral district|utility|power station|water treatment|wastewater|sewage|office building|commercial building)\b/i;
const genericInfrastructure = /\b(?:bridge|puente|overpass|flyover|interchange|motorway|expressway|causeway|toll road|roadway|road tunnel|bus depot|rail yard)\b/i;
const sportsVenue = /\b(?:stadium|estadio|sports complex|sports ground|athletic field|football ground|arena)\b/i;
const strongVisitorEvidence = /\b(?:tourist attraction|major attraction|visitor attraction|visitor destination|tourist destination|guided tours?|bookable experience|world heritage|unesco|iconic|famous|renowned|notable|internationally recogni[sz]ed|historic landmark|major landmark|museum|observation deck|architecture tours?|home of the national|national monument|cultural landmark)\b/i;
const usefulCategory = /\b(?:attraction|landmark|museum|archaeological|historic site|heritage|neighbou?rhood|viewpoint|park|garden|beach|natural area|hike|trail|market|restaurant|cafe|tour|experience|ticket|boat trip|day trip)\b/i;

/**
 * Shared visitor-relevance boundary for Explore, Map and Itinerary. It rejects
 * administrative objects and requires extra evidence before generic transport
 * infrastructure or sports venues can masquerade as traveller highlights.
 */
export function discoveryVisitorRelevance(candidate: DiscoveryVisitorCandidate) {
  const evidence = [candidate.title, candidate.category, ...(candidate.tags ?? []), candidate.description]
    .filter(Boolean)
    .join(" ");
  if (candidate.kind === "restaurant" || candidate.kind === "tour") {
    return { eligible: true, scoreAdjustment: 0, strongEvidence: true };
  }
  if (administrativeEntity.test(evidence)) {
    return { eligible: false, scoreAdjustment: -30, strongEvidence: false };
  }
  const explicitVisitorEvidence = strongVisitorEvidence.test(evidence);
  const strongEvidence = explicitVisitorEvidence
    || (usefulCategory.test(`${candidate.category ?? ""} ${(candidate.tags ?? []).join(" ")}`)
      && (candidate.qualityScore ?? 0) >= 14);
  // A synthetic discovery score alone is not enough to turn ordinary road or
  // sports infrastructure into a visitor attraction.
  if ((genericInfrastructure.test(evidence) || sportsVenue.test(evidence)) && !explicitVisitorEvidence) {
    return { eligible: false, scoreAdjustment: -24, strongEvidence: false };
  }
  return {
    eligible: true,
    scoreAdjustment: usefulCategory.test(evidence) ? 2 : 0,
    strongEvidence,
  };
}
