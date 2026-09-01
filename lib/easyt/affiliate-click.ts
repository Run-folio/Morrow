import type { LaunchAnalyticsEventMap } from "../analytics.ts";
import type { ResolvedAffiliateAction } from "./booking-readiness.ts";

export type AffiliateClickContext = {
  placement: LaunchAnalyticsEventMap["affiliate_link_clicked"]["placement"] | string;
  tripId?: string;
  stopId?: string;
  transferId?: string;
  originStopId?: string;
  destinationStopId?: string;
  workspaceView?: "overview" | "itinerary" | "map";
  destinationCount?: number;
};

export type ResolvedAffiliateClickEvent =
  | { name: "affiliate_link_clicked"; properties: LaunchAnalyticsEventMap["affiliate_link_clicked"] }
  | { name: "affiliate_click"; properties: LaunchAnalyticsEventMap["affiliate_click"] };

/** Pure event selection: a single click can resolve to exactly one source event. */
export function affiliateClickEventForAction(
  action: ResolvedAffiliateAction,
  context: AffiliateClickContext,
): ResolvedAffiliateClickEvent {
  if (action.provider === "viator" || action.provider === "omio") {
    return {
      name: "affiliate_link_clicked",
      properties: {
        partner: action.provider,
        placement: context.placement as LaunchAnalyticsEventMap["affiliate_link_clicked"]["placement"],
        tripId: context.tripId,
        stopId: context.stopId,
        transferId: context.transferId,
        originStopId: context.originStopId,
        destinationStopId: context.destinationStopId,
      },
    };
  }
  return {
    name: "affiliate_click",
    properties: {
      category: action.category,
      provider: action.provider,
      placement: context.placement,
      trip_id: context.tripId,
      stop_id: context.stopId,
      workspace_view: context.workspaceView,
      destination_count: context.destinationCount,
    },
  };
}
