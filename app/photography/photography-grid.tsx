"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageLightbox } from "@/components/image-lightbox";
import { cloudinaryImage, type TravelPhoto } from "@/lib/photography";

export function PhotographyGrid({ photos }: { photos: TravelPhoto[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedPhoto = selectedIndex === null ? null : photos[selectedIndex];

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {photos.map((photo, index) => (
          <button
            key={photo.publicId}
            type="button"
            onClick={() => setSelectedIndex(index)}
            className="group relative overflow-hidden rounded-[24px] bg-mist text-left transition duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-4 focus-visible:ring-offset-paper dark:bg-white/6 dark:focus-visible:ring-offset-[#0d0d0c]"
            aria-label={`Open photo from ${photo.country}`}
          >
            <span className="relative block aspect-[4/3]">
              <Image
                src={cloudinaryImage(photo.publicId)}
                alt={`Travel photography from ${photo.country}`}
                fill
                sizes="(min-width: 1280px) 31vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover transition duration-300 group-hover:scale-[1.03]"
              />
            </span>
            <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/66 via-black/20 to-transparent px-5 pb-5 pt-20 text-white">
              <span className="text-lg font-[520] tracking-[-0.01em]">{photo.country}</span>
              <span className="text-2xl leading-none" aria-hidden="true">
                {photo.flag}
              </span>
            </span>
          </button>
        ))}
      </div>

      {selectedPhoto && selectedIndex !== null ? (
        <ImageLightbox
          images={photos.map((photo) => ({
            src: cloudinaryImage(photo.publicId),
            alt: `Travel photography from ${photo.country}`,
            label: photo.country,
            detail: photo.flag,
          }))}
          selectedIndex={selectedIndex}
          onClose={() => setSelectedIndex(null)}
          onSelect={setSelectedIndex}
        />
      ) : null}
    </>
  );
}
