"use client";

import Image from "next/image";
import { useId, useState } from "react";
import type { CaseStudyMedia } from "@/lib/case-studies";

/**
 * Draggable / keyboard-operable before-after comparison. A native range
 * input spans the full frame as an invisible drag surface (works with touch
 * and keyboard for free); a visual handle line tracks its value and gets a
 * focus ring via the `peer` relationship for accessibility.
 */
export function BeforeAfterSlider({
  before,
  after,
  label,
}: {
  before: CaseStudyMedia;
  after: CaseStudyMedia;
  label?: string;
}) {
  const [value, setValue] = useState(50);
  const id = useId();

  return (
    <figure className="overflow-hidden rounded-[24px] bg-mist dark:bg-white/6">
      <div className="relative aspect-[16/10] w-full select-none overflow-hidden">
        <Image src={after.src} alt={after.alt ?? after.caption} fill sizes="100vw" className="object-cover" priority={false} />

        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - value}% 0 0)` }}>
          <Image src={before.src} alt={before.alt ?? before.caption} fill sizes="100vw" className="object-cover" priority={false} />
        </div>

        <span className="pointer-events-none absolute left-4 top-4 z-10 rounded-full bg-black/55 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-white backdrop-blur-sm">
          Before
        </span>
        <span className="pointer-events-none absolute right-4 top-4 z-10 rounded-full bg-black/55 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-white backdrop-blur-sm">
          After
        </span>

        <input
          id={id}
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
          aria-label={label ?? `Drag to compare before and after: ${before.caption} versus ${after.caption}`}
          className="peer absolute inset-0 z-20 h-full w-full cursor-ew-resize appearance-none bg-transparent opacity-0"
        />

        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-[2px] -translate-x-1/2 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.15)] peer-focus-visible:w-[3px] peer-focus-visible:bg-signal"
          style={{ left: `${value}%` }}
        >
          <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-[0_6px_20px_rgba(0,0,0,0.25)] peer-focus-visible:ring-2 peer-focus-visible:ring-signal peer-focus-visible:ring-offset-2">
            <span aria-hidden="true" className="text-sm">
              ↔
            </span>
          </div>
        </div>
      </div>
      <figcaption className="border-t border-black/10 px-5 py-4 text-sm font-[330] leading-[1.45] text-black/62 dark:border-white/10 dark:text-white/62">
        {label ?? `${before.caption} → ${after.caption}`}
      </figcaption>
    </figure>
  );
}
