"use client";

import { ExternalLink } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { affiliateClickEventForAction, type AffiliateClickContext } from "@/lib/easyt/affiliate-click";
import { affiliateProviderLabel, type ResolvedAffiliateAction } from "@/lib/easyt/booking-readiness";
import { EasyTLinkButton } from "./easyt-controls";

export const affiliateDisclosure = "Partner link · Morrovia may earn a commission at no extra cost to you. Booking, payment and provider terms apply on the partner’s site.";

export function MorroviaAffiliateLink({
  action,
  context,
  className,
  size = "small",
  variant = "secondary",
  fullWidth = false,
}: {
  action: ResolvedAffiliateAction;
  context: AffiliateClickContext;
  className?: string;
  size?: "small" | "medium" | "large";
  variant?: "primary" | "secondary" | "quiet" | "danger";
  fullWidth?: boolean;
}) {
  const providerLabel = affiliateProviderLabel(action.provider);
  const onClick = () => {
    const event = affiliateClickEventForAction(action, context);
    if (event.name === "affiliate_link_clicked") trackEvent(event.name, event.properties);
    else trackEvent(event.name, event.properties);
  };
  return <EasyTLinkButton
    className={className}
    href={action.href}
    target="_blank"
    rel="sponsored noopener noreferrer"
    aria-label={`${action.cta}, opens ${providerLabel} in a new tab`}
    icon={ExternalLink}
    size={size}
    variant={variant}
    fullWidth={fullWidth}
    data-affiliate-provider={action.provider}
    onClick={onClick}
  >{action.cta}</EasyTLinkButton>;
}
