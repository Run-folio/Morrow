"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

export function CaseStudyAnalytics({ slug, title }: { slug: string; title: string }) {
  useEffect(() => {
    trackEvent("case_study_opened", {
      case_study_slug: slug,
      case_study_title: title,
    });
  }, [slug, title]);

  return null;
}

