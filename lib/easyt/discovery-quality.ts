export type DiscoveryVisitorCandidate = {
  title: string;
  category?: string;
  tags?: readonly string[];
  description?: string;
  qualityScore?: number;
  kind?: "activity" | "restaurant" | "tour";
};

const administrativeEntity = /\b(?:administrative|administration|government office|municipal office|city hall|county|province|prefecture|administrative region|electoral district|utility|power station|water treatment|wastewater|sewage)\b/i;
const genericInfrastructure = /\b(?:bridge|puente|overpass|flyover|interchange|motorway|expressway|causeway|toll road|roadway|road tunnel|bus depot|rail yard)\b/i;
const transportFacility = /\b(?:railway|train|metro|subway|bus|coach)\s+(?:station|terminal|stop)|\b(?:station|terminal|transport hub)\b/i;
const ordinaryBuilding = /\b(?:office building|commercial building|theat(?:re|er)|opera house|performing arts cent(?:re|er))\b/i;
const historicalEvent = /\b(?:bombing|battle|siege|war|massacre|uprising|revolution|earthquake|disaster|fire)\s+(?:of|at|in)\b/i;
const visitorPlaceForm = /\b(?:museum|memorial|monument|historic site|heritage site|visitor cent(?:re|er)|park|garden)\b/i;
const sportsVenue = /\b(?:stadium|estadio|sports complex|sports ground|athletic field|football ground|arena)\b/i;
const explicitVisitorEvidence = /\b(?:tourist attraction|major attraction|visitor attraction|visitor destination|tourist destination|guided tours?|bookable experience|world heritage|unesco|iconic landmark|internationally recogni[sz]ed attraction|historic landmark|major landmark|observation deck|architecture tours?|national monument|cultural landmark)\b/i;
const strongVisitorEvidence = /\b(?:museum|monument|visitor attraction|tourist attraction|world heritage|unesco|historic landmark|major landmark|observation deck|national monument|cultural landmark)\b/i;
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
  const explicitAttractionEvidence = explicitVisitorEvidence.test(evidence);
  const strongEvidence = strongVisitorEvidence.test(evidence)
    || (usefulCategory.test(`${candidate.category ?? ""} ${(candidate.tags ?? []).join(" ")}`)
      && (candidate.qualityScore ?? 0) >= 14);
  if (historicalEvent.test(`${candidate.title} ${candidate.category ?? ""}`) && !visitorPlaceForm.test(`${candidate.title} ${candidate.description ?? ""}`)) {
    return { eligible: false, scoreAdjustment: -30, strongEvidence: false };
  }
  // A synthetic discovery score alone is not enough to turn ordinary road or
  // transport, venue or building infrastructure into a visitor attraction.
  if ((genericInfrastructure.test(evidence) || transportFacility.test(evidence) || sportsVenue.test(evidence) || ordinaryBuilding.test(evidence)) && !explicitAttractionEvidence) {
    return { eligible: false, scoreAdjustment: -24, strongEvidence: false };
  }
  return {
    eligible: true,
    scoreAdjustment: usefulCategory.test(evidence) ? 2 : 0,
    strongEvidence,
  };
}
