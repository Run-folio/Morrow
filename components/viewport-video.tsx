"use client";

import { useEffect, useRef } from "react";

type ViewportVideoProps = {
  src: string;
  className?: string;
  autoplayOnView?: boolean;
};

export function ViewportVideo({ src, className, autoplayOnView }: ViewportVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !autoplayOnView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void video.play().catch(() => {
            // Autoplay can still be blocked in some browser settings; controls remain available.
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.45 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [autoplayOnView]);

  return (
    <video
      ref={videoRef}
      className={className}
      controls
      muted
      playsInline
      preload="metadata"
      loop={autoplayOnView}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
