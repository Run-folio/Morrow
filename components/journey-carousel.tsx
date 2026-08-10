"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { JourneyImage } from "@/lib/journey";
import styles from "@/app/journey/journey.module.css";

export function JourneyCarousel({ images, city, storyKey }: { images: JourneyImage[]; city: string; storyKey: string }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => setIndex(0), [storyKey]);

  const move = (nextDirection: number) => {
    setDirection(nextDirection);
    setIndex((current) => (current + nextDirection + images.length) % images.length);
  };

  const image = images[index];
  if (!image) return null;

  return (
    <figure className={styles.mediaCarousel} aria-label={`${city} image gallery`}>
      <div className={styles.carouselViewport}>
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            className={styles.carouselImage}
            key={image.src}
            custom={direction}
            initial={{ opacity: 0, x: direction * 28, scale: 1.015 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: direction * -22, scale: .99 }}
            transition={{ duration: .42, ease: [0.22, 1, 0.36, 1] }}
          >
            <Image unoptimized fill priority sizes="(max-width: 760px) 88vw, 430px" src={image.src} alt={image.alt} />
          </motion.div>
        </AnimatePresence>
        {images.length > 1 ? <div className={styles.carouselControls}>
          <button type="button" onClick={() => move(-1)} aria-label="Previous image"><ArrowLeft /></button>
          <button type="button" onClick={() => move(1)} aria-label="Next image"><ArrowRight /></button>
        </div> : null}
        <span className={styles.imageCount}>{String(index + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}</span>
      </div>
      <figcaption>
        <span>{image.caption}</span>
        <div className={styles.carouselDots} aria-label="Choose image">
          {images.map((item, dotIndex) => <button key={item.src} type="button" className={dotIndex === index ? styles.currentDot : ""} onClick={() => { setDirection(dotIndex > index ? 1 : -1); setIndex(dotIndex); }} aria-label={`View image ${dotIndex + 1}`} />)}
        </div>
        <a href={image.sourceUrl} target="_blank" rel="noreferrer">Wikimedia ↗</a>
      </figcaption>
    </figure>
  );
}
