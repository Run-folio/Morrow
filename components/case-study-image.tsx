"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ImageLightbox, type LightboxImage } from "@/components/image-lightbox";
import type { CaseStudyMedia } from "@/lib/case-studies";

export function CaseStudyImage({ item, gallery }: { item: CaseStudyMedia; gallery: CaseStudyMedia[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const images = useMemo<LightboxImage[]>(
    () =>
      gallery.map((media) => ({
        src: media.src,
        alt: media.alt ?? media.caption,
        label: media.alt ?? media.caption,
        detail: media.caption,
      })),
    [gallery],
  );
  const itemIndex = Math.max(0, gallery.findIndex((media) => media.src === item.src && media.caption === item.caption));

  return (
    <>
      <button
        type="button"
        onClick={() => setSelectedIndex(itemIndex)}
        className="group block w-full cursor-zoom-in text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-inset"
        aria-label={`Open ${item.alt ?? item.caption}`}
      >
        <Image
          src={item.src}
          alt={item.alt ?? item.caption}
          width={1800}
          height={1100}
          sizes="100vw"
          className="h-auto w-full transition duration-300 group-hover:scale-[1.01]"
        />
      </button>
      {selectedIndex !== null ? <ImageLightbox images={images} selectedIndex={selectedIndex} onClose={() => setSelectedIndex(null)} onSelect={setSelectedIndex} /> : null}
    </>
  );
}
