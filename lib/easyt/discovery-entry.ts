import { createDiscoveryDraft, readDiscoveryDraft, type DiscoveryStep } from "./discovery-draft.ts";
import { projectDiscovery } from "./discovery-projection.ts";
import type { ResolvedPlaceMention } from "./place-intelligence.ts";
import type { StructuredTripBrief } from "./structured-trip-brief.ts";

export type DiscoveryEntryKind = "skip" | "continent" | "country" | "region" | "landmark" | "natural-area" | "clarification" | "legacy-recovery";
export type DiscoveryEntry = {
  kind: DiscoveryEntryKind;
  step: DiscoveryStep;
  mentionId?: string;
  reason?: "actionable-route" | "unsupported-version" | "technical-failure" | "unresolved-identity";
};

const broadType = (mention: ResolvedPlaceMention): DiscoveryEntryKind => {
  switch (mention.placeType) {
    case "continent":
    case "macro_region": return "continent";
    case "country": return "country";
    case "region":
    case "sub_region":
    case "island":
    case "archipelago":
    case "coast":
    case "mountain_range":
    case "valley":
    case "travel_corridor": return "region";
    case "landmark": return "landmark";
    case "natural_area": return "natural-area";
    default: return "clarification";
  }
};

/** Classifies a geographic decision; evidence depth never determines shell eligibility. */
export function discoveryEntryForBrief(
  brief: StructuredTripBrief,
  actionablePlaceIds: readonly string[],
  preferredMentionId?: string,
): DiscoveryEntry {
  const mentions = (brief.placeMentions ?? []).filter(mention => !(brief.removedPlaceMentionIds ?? []).includes(mention.mentionId));
  const target = preferredMentionId ? mentions.find(mention => mention.mentionId === preferredMentionId) : undefined;
  if (target?.status === "resolved" && target.routability === "direct_destination"
    && target.canonicalPlaceId && actionablePlaceIds.includes(target.canonicalPlaceId))
    return { kind: "skip", step: "review", mentionId: target.mentionId, reason: "actionable-route" };
  const directAndActionable = mentions.length > 0 && mentions.every(mention =>
    mention.status === "resolved" && mention.routability === "direct_destination"
      && Boolean(mention.canonicalPlaceId && actionablePlaceIds.includes(mention.canonicalPlaceId)));
  if (directAndActionable) return { kind: "skip", step: "review", reason: "actionable-route" };
  const mention = target ?? mentions.find(item => item.routability !== "direct_destination" || item.status !== "resolved");
  if (!mention) return { kind: "skip", step: "review", reason: "actionable-route" };
  const read = readDiscoveryDraft(brief, mention.mentionId);
  if (read.status === "unsupported-version") return { kind: "legacy-recovery", step: "places", mentionId: mention.mentionId, reason: "unsupported-version" };
  const semanticKind = broadType(mention);
  const kind = mention.status === "resolved" && mention.canonicalPlaceId
    ? semanticKind
    : semanticKind === "natural-area" ? semanticKind : "clarification";
  if (kind === "clarification") return { kind, step: "places", mentionId: mention.mentionId, reason: "unresolved-identity" };
  try {
    const projection = projectDiscovery({ mention, draft: read.draft ?? createDiscoveryDraft(), context: { interests: [], existingPlaceIds: [...actionablePlaceIds] } });
    const initialStep: DiscoveryStep = kind === "landmark" || kind === "natural-area" ? "bases"
      : projection.directions.length > 0 ? "directions" : "places";
    return { kind, step: read.status === "current" ? read.draft.step : initialStep, mentionId: mention.mentionId };
  } catch {
    return { kind: "legacy-recovery", step: "places", mentionId: mention.mentionId, reason: "technical-failure" };
  }
}
