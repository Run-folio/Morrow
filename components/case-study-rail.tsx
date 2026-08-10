"use client";

import { useEffect, useState } from "react";

type RailItem = { id: string; label: string };

/**
 * Desktop-only sticky glass rail showing which beat of a case study is in
 * view, plus a fill line indicating overall progress through the sections.
 * Purely a wayfinding aid on long pages — hidden below lg.
 */
export function CaseStudyRail({ items }: { items: RailItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const elements = items.map((item) => document.getElementById(item.id)).filter((el): el is HTMLElement => Boolean(el));
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [items]);

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeId),
  );
  const fillRatio = items.length > 1 ? activeIndex / (items.length - 1) : 0;

  return (
    <nav
      aria-label="Case study sections"
      className="fixed right-6 top-1/2 z-40 hidden -translate-y-1/2 rounded-full border border-black/10 bg-white/60 px-3 py-4 shadow-[0_10px_40px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0d0d0c]/60 lg:flex"
    >
      <div className="relative flex flex-col items-center gap-4">
        <div className="pointer-events-none absolute left-1/2 top-1 h-[calc(100%-8px)] w-px -translate-x-1/2 bg-black/10 dark:bg-white/15" />
        <div
          className="pointer-events-none absolute left-1/2 top-1 w-px -translate-x-1/2 bg-signal transition-[height] duration-300 ease-premium"
          style={{ height: `calc(${fillRatio} * (100% - 8px))` }}
        />
        {items.map((item) => (
          <a key={item.id} href={`#${item.id}`} className="group relative flex items-center" aria-current={activeId === item.id ? "true" : undefined}>
            <span
              className={`relative z-10 h-2 w-2 rounded-full transition-all duration-300 ease-premium ${
                activeId === item.id ? "scale-125 bg-signal" : "bg-black/25 dark:bg-white/30"
              }`}
            />
            <span className="pointer-events-none absolute right-6 whitespace-nowrap rounded-md bg-ink/90 px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.1em] text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              {item.label}
            </span>
          </a>
        ))}
      </div>
    </nav>
  );
}
