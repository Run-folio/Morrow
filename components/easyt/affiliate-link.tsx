"use client";

import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";
import { affiliateClickEventForAction, type AffiliateClickContext } from "@/lib/easyt/affiliate-click";
import { affiliateProviderLabel, type ResolvedAffiliateAction } from "@/lib/easyt/booking-readiness";
import { EasyTLinkButton } from "./easyt-controls";

export const affiliateDisclosure = "Partner link · Morrovia may earn a commission at no extra cost to you. Booking, payment and provider terms apply on the partner’s site.";
export const compactAffiliateDisclosure = "Partner links · Morrovia may earn a commission at no extra cost to you.";
export const worldNomadsAffiliateDisclosure = "We receive a fee when you get a quote from World Nomads using this link. We do not represent World Nomads. This is not a recommendation to buy travel insurance.";

export function affiliateDisclosureForProvider(provider: string) {
  return provider === "world-nomads" ? worldNomadsAffiliateDisclosure : affiliateDisclosure;
}

export function MorroviaAffiliateLink({
  action,
  context,
  className,
  size = "small",
  variant = "secondary",
  fullWidth = false,
  iconOnly = false,
  renderAsSurface = false,
  children,
}: {
  action: ResolvedAffiliateAction;
  context: AffiliateClickContext;
  className?: string;
  size?: "small" | "medium" | "large";
  variant?: "primary" | "secondary" | "quiet" | "danger";
  fullWidth?: boolean;
  iconOnly?: boolean;
  /** Lets a product-pattern owner make its complete surface the one outbound control. */
  renderAsSurface?: boolean;
  children?: ReactNode;
}) {
  const providerLabel = affiliateProviderLabel(action.provider);
  const onClick = () => {
    const event = affiliateClickEventForAction(action, context);
    if (event.name === "affiliate_link_clicked") trackEvent(event.name, event.properties);
    else trackEvent(event.name, event.properties);
  };
  const accessibleLabel = `${action.cta}, opens ${providerLabel} in a new tab`;
  if (renderAsSurface) {
    return <a
      className={className}
      href={action.href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      data-affiliate-provider={action.provider}
      onClick={onClick}
    >{children ?? action.cta}<span className="sr-only">{`Opens ${providerLabel} in a new tab.`}</span></a>;
  }
  return <EasyTLinkButton
    className={className}
    href={action.href}
    target="_blank"
    rel="sponsored noopener noreferrer"
    aria-label={accessibleLabel}
    icon={ExternalLink}
    size={size}
    variant={variant}
    fullWidth={fullWidth}
    iconOnly={iconOnly}
    data-affiliate-provider={action.provider}
    onClick={onClick}
  >{children ?? action.cta}</EasyTLinkButton>;
}
