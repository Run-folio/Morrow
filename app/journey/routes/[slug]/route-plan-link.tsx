"use client";

import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { trackEvent } from "@/lib/analytics";
import { beginNewTripNavigation, loadRememberedOwner } from "@/lib/easyt/storage";
import { authClient } from "@/lib/auth-client";
import type { PublicRoutePlanDraft } from "@/lib/easyt/public-route";

export default function RoutePlanLink({
  draft,
  placement,
  className,
  children = "Plan this route",
}: {
  draft: PublicRoutePlanDraft;
  placement: "hero" | "final" | "discovery";
  className?: string;
  children?: string;
}) {
  const { data: session } = authClient.useSession();
  const href = useMemo(() => `/journey/new?inspire=${encodeURIComponent(draft.routeKey)}`, [draft.routeKey]);
  return <EasyTLinkButton
    className={className}
    href={href}
    prefetch={false}
    icon={ArrowRight}
    size="large"
    onClick={(event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      const ownerId = session?.user?.id ?? loadRememberedOwner();
      if (!beginNewTripNavigation(ownerId, window)) return;
      trackEvent("route_started", {
        route_id: draft.routeKey,
        stop_count: draft.destinations.length,
        duration_days: draft.durationDays,
        placement,
      });
      window.location.assign(href);
    }}
  >{children}</EasyTLinkButton>;
}
