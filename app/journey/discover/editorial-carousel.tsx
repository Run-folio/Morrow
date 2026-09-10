"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { EasyTButton, EasyTLinkButton } from "@/components/easyt/easyt-controls";
import type { RoutesEditorialChapter } from "@/lib/easyt/routes-overview-editorial";
import RoutePlanLink from "../routes/[slug]/route-plan-link";
import { discoveryDuration, discoverySequence, discoveryShape } from "@/lib/easyt/route-discovery";
import DiscoveryPhoto from "./discovery-photo";
import styles from "./editorial-carousel.module.css";

export default function EditorialCarousel({ chapters, imageUnavailable = false }: { chapters: RoutesEditorialChapter[]; imageUnavailable?: boolean }) {
  const [index, setIndex] = useState(0);
  const activeIndex = index % Math.max(chapters.length, 1);
  const chapter = chapters[activeIndex];
  if (!chapter) return null;
  const move = (direction: number) => setIndex((current) => (current + direction + chapters.length) % chapters.length);
  return <section id="featured-route" className={styles.carousel} aria-roledescription="carousel" aria-label="A route worth starting with">
    <header className={styles.toolbar}><h2>A route worth starting with</h2><div className={styles.controls}>
      <span role="status" aria-live="polite" aria-atomic="true">{String(activeIndex + 1).padStart(2, "0")} / {String(chapters.length).padStart(2, "0")}<span className="sr-only"> · {chapter.route.title}</span></span>
      <EasyTButton variant="secondary" icon={ArrowLeft} aria-label="Previous featured route" aria-controls="featured-route-slide" disabled={chapters.length < 2} onClick={() => move(-1)}>Previous</EasyTButton>
      <EasyTButton variant="secondary" icon={ArrowRight} aria-label="Next featured route" aria-controls="featured-route-slide" disabled={chapters.length < 2} onClick={() => move(1)}>Next</EasyTButton>
    </div></header>
    <div id="featured-route-slide" className={styles.chapter} role="group" aria-roledescription="slide" aria-label={`${activeIndex + 1} of ${chapters.length}: ${chapter.route.title}`}>
      <DiscoveryPhoto route={chapter.route} image={chapter.image} sizes="100vw" unavailable={imageUnavailable} className={styles.photograph} />
      <div className={styles.shade} />
      <div className={styles.copy}>
        <p className={styles.eyebrow}>{chapter.route.countries.join(" + ")}</p>
        <h3>{chapter.title}<em>{chapter.emphasis}</em></h3>
        <p className={styles.character}>{chapter.route.character}</p>
        <p className={styles.idea}>{chapter.route.bestFor}</p>
        <p className={styles.sequence}>{discoverySequence(chapter.route)}</p>
        <p className={styles.facts}>{discoveryDuration(chapter.route)} · {discoveryShape(chapter.route)}</p>
        <div className={styles.actions}><RoutePlanLink draft={chapter.draft} placement="discovery" className={styles.start}>Start with this route</RoutePlanLink><EasyTLinkButton href={chapter.route.href} prefetch={false} variant="quiet" className={styles.secondary}>See whole journey</EasyTLinkButton></div>
      </div>
    </div>
  </section>;
}
