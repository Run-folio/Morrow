"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef, MouseEvent, ReactNode } from "react";
import type { AnalyticsEventProperties, LegacyAnalyticsEventName } from "@/lib/analytics";
import { sanitizeAnalyticsDestination, trackEvent } from "@/lib/analytics";

type TrackedProps = {
  eventName: LegacyAnalyticsEventName;
  eventData?: AnalyticsEventProperties;
  children: ReactNode;
};

function isModifiedEvent(event: MouseEvent) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.button !== 0;
}

function trackClick(
  event: MouseEvent,
  eventName: LegacyAnalyticsEventName,
  eventData: AnalyticsEventProperties | undefined,
  href: string,
) {
  if (isModifiedEvent(event)) {
    return;
  }

  trackEvent(eventName, {
    destination_url: sanitizeAnalyticsDestination(href),
    ...eventData,
  });
}

type TrackedLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, "onClick"> & TrackedProps;

export function TrackedLink({ href, eventName, eventData, children, ...props }: TrackedLinkProps) {
  const destination = typeof href === "string" ? href : href.toString();

  return (
    <Link href={href} onClick={(event) => trackClick(event, eventName, eventData, destination)} {...props}>
      {children}
    </Link>
  );
}

type TrackedAnchorProps = Omit<ComponentPropsWithoutRef<"a">, "onClick"> & TrackedProps & { href: string };

export function TrackedAnchor({ href, eventName, eventData, children, ...props }: TrackedAnchorProps) {
  return (
    <a href={href} onClick={(event) => trackClick(event, eventName, eventData, href)} {...props}>
      {children}
    </a>
  );
}
