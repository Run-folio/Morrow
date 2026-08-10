"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect } from "react";

export type LightboxImage = {
  src: string;
  alt: string;
  label: string;
  detail?: string;
};

type ImageLightboxProps = {
  images: LightboxImage[];
  selectedIndex: number;
  onClose: () => void;
  onSelect: (index: number) => void;
};

export function ImageLightbox({ images, selectedIndex, onClose, onSelect }: ImageLightboxProps) {
  const selectedImage = images[selectedIndex];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowLeft") {
        onSelect(selectedIndex === 0 ? images.length - 1 : selectedIndex - 1);
      }

      if (event.key === "ArrowRight") {
        onSelect(selectedIndex === images.length - 1 ? 0 : selectedIndex + 1);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [images.length, onClose, onSelect, selectedIndex]);

  if (!selectedImage) {
    return null;
  }

  const showPrevious = () => onSelect(selectedIndex === 0 ? images.length - 1 : selectedIndex - 1);
  const showNext = () => onSelect(selectedIndex === images.length - 1 ? 0 : selectedIndex + 1);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/82 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={selectedImage.label}
      onClick={onClose}
    >
      <div
        className="relative flex h-[calc(100dvh-1.5rem)] w-full max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[24px] bg-paper shadow-2xl dark:bg-[#11110f] sm:h-[calc(100dvh-2.5rem)] sm:max-w-[calc(100vw-2.5rem)] 2xl:max-w-[1800px]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-sm transition duration-200 hover:bg-signal hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-4 focus-visible:ring-offset-black dark:bg-black dark:text-white"
          aria-label="Close image"
        >
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={showPrevious}
              className="absolute left-4 top-[42%] z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-white shadow-sm transition duration-200 hover:bg-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-4 focus-visible:ring-offset-black dark:bg-white dark:text-ink"
              aria-label="Previous image"
            >
              <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={showNext}
              className="absolute right-4 top-[42%] z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-white shadow-sm transition duration-200 hover:bg-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-4 focus-visible:ring-offset-black dark:bg-white dark:text-ink"
              aria-label="Next image"
            >
              <ChevronRight size={24} strokeWidth={2} aria-hidden="true" />
            </button>
          </>
        ) : null}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[24px] bg-black">
          <Image src={selectedImage.src} alt={selectedImage.alt} fill sizes="100vw" className="object-contain" priority />
        </div>
        <div className="shrink-0 px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xl font-[520] tracking-[-0.015em] text-ink dark:text-white">{selectedImage.label}</p>
            <span className="shrink-0 font-mono text-xs uppercase tracking-[0.16em] text-black/48 dark:text-white/48">
              {selectedIndex + 1} / {images.length}
            </span>
          </div>
          {selectedImage.detail ? <p className="mt-1 text-sm text-black/56 dark:text-white/56">{selectedImage.detail}</p> : null}
          {images.length > 1 ? (
            <div className="mt-3 flex max-w-full gap-2 overflow-x-auto px-1 py-1">
              {images.map((image, index) => {
                const isSelected = index === selectedIndex;

                return (
                  <button
                    key={`${image.src}-${image.label}`}
                    type="button"
                    onClick={() => onSelect(index)}
                    className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-[10px] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:focus-visible:ring-offset-[#11110f] ${
                      isSelected ? "ring-2 ring-signal" : "opacity-60 hover:opacity-100"
                    }`}
                    aria-label={`Show ${image.label}`}
                    aria-current={isSelected}
                  >
                    <Image src={image.src} alt="" fill sizes="80px" className="object-cover" />
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
