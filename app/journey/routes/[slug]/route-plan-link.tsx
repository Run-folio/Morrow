"use client";

import { ArrowRight } from "lucide-react";
import { useMemo, useEffect, useState } from "react";
import { EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { trackEvent } from "@/lib/analytics";
import { beginNewTripNavigation, loadRememberedOwner } from "@/lib/easyt/storage";
import { authClient } from "@/lib/auth-client";
import type { PublicRoutePlanDraft } from "@/lib/easyt/public-route";
import { useNewTripNavigationScope } from "../../use-new-trip-navigation-scope";

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
  const [rememberedOwnerId, setRememberedOwnerId] = useState<string | null>(null);
  const [addressReady, setAddressReady] = useState(false);
  useEffect(() => { let active=true; void loadRememberedOwner().then(owner=>{if(active){setRememberedOwnerId(owner);setAddressReady(true);}}); return()=>{active=false;}; }, []);
  const href = useMemo(() => `/journey/new?inspire=${encodeURIComponent(draft.routeKey)}`, [draft.routeKey]);
  const newTripNavigation = useNewTripNavigationScope(() => session?.user?.id ?? rememberedOwnerId, JSON.stringify([draft, placement]));
  return <EasyTLinkButton
    className={className}
    href={href}
    prefetch={false}
    icon={ArrowRight}
    size="large"
    onClick={async (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      if (!session?.user?.id && !addressReady) return;
      const request = newTripNavigation.start();
      if (!request) return;
      try {
        if (await beginNewTripNavigation(request.ownerId, window, request.isCurrent) !== true || !request.isCurrent()) return;
        trackEvent("route_started", {
          route_id: draft.routeKey,
          stop_count: draft.destinations.length,
          duration_days: draft.durationDays,
          placement,
        });
        window.location.assign(href);
      } catch {
        // Preserve the current route when its pending work could not be saved.
      } finally {
        request.finish();
      }
    }}
  >{children}</EasyTLinkButton>;
}
