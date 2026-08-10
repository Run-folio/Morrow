"use client";

import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { StaggerGroup, StaggerItem } from "./motion";

type Metric = { value: string; label: string };

/**
 * Renders the case study hero image with a subtle scroll-linked scale +
 * parallax, and a metrics panel that overlaps its bottom edge as a glass
 * surface on large screens (stacked, solid on mobile for legibility).
 */
export function CaseStudyHeroMedia({
  image,
  imageAlt,
  metrics,
}: {
  image: string;
  imageAlt: string;
  metrics: Metric[];
}) {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "end start"] });

  const scale = useTransform(scrollYProgress, [0, 1], reduceMotion ? [1, 1] : [1, 1.045]);
  const y = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [-14, 14]);

  return (
    <div ref={sectionRef} className="relative">
      <div className="overflow-hidden rounded-[24px] bg-mist dark:bg-white/6">
        <motion.div style={{ scale, y }}>
          <Image
            src={image}
            alt={imageAlt}
            width={1800}
            height={1100}
            priority
            sizes="100vw"
            className="h-auto w-full"
          />
        </motion.div>
      </div>

      {/* Metrics: a solid card on mobile, a glass panel overlapping the
          image's bottom edge on lg+ for depth. */}
      <StaggerGroup
        className="relative z-10 mx-4 -mt-10 grid gap-6 rounded-[20px] border border-white/15 bg-ink/95 px-6 py-7 text-white shadow-[0_20px_60px_rgba(0,0,0,0.3)] sm:mx-8 sm:grid-cols-2 sm:px-8 lg:-mt-16 lg:grid-cols-4 lg:gap-8 lg:rounded-[24px] lg:bg-ink/45 lg:px-10 lg:py-8 lg:backdrop-blur-xl"
        staggerDelay={0.08}
      >
        {metrics.map((metric) => (
          <StaggerItem key={`${metric.value}-${metric.label}`}>
            <p className="text-4xl font-[340] tracking-[-0.025em] lg:text-[2.6rem]">{metric.value}</p>
            <p className="mt-2 max-w-xs text-sm font-[330] leading-[1.4] text-white/72">{metric.label}</p>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </div>
  );
}
