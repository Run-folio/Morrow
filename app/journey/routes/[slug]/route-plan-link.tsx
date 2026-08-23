"use client";

import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { trackEvent } from "@/lib/analytics";
import { routePlannerPayload } from "@/lib/easyt/public-route-handoff";
import { clearActiveTrip } from "@/lib/easyt/storage";
import type { PublicRoutePlanDraft } from "@/lib/easyt/public-route";

export default function RoutePlanLink({
  draft,
  placement,
  className,
  children = "Plan this route",
}: {
  draft: PublicRoutePlanDraft;
  placement: "hero" | "final";
  className?: string;
  children?: string;
}) {
  const href = useMemo(() => `/journey/new?homeDraft=1&inspire=${encodeURIComponent(draft.routeKey)}`, [draft.routeKey]);
  return <EasyTLinkButton
    className={className}
    href={href}
    icon={ArrowRight}
    size="large"
    onClick={() => {
      try {
        clearActiveTrip();
        window.localStorage.setItem("easyt-home-trip-draft", JSON.stringify(routePlannerPayload(draft)));
      } catch {
        // The inspire query remains a safe, less detailed fallback when device storage is unavailable.
      }
      trackEvent("route_started", {
        route_id: draft.routeKey,
        stop_count: draft.destinations.length,
        duration_days: draft.durationDays,
        placement,
      });
    }}
  >{children}</EasyTLinkButton>;
}
