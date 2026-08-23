"use client";

import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";

type ResilientImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
  fallback: ReactNode;
};

/**
 * Keeps provider and persisted-image failures inside the media slot that owns
 * them. A later source gets a fresh attempt instead of inheriting the previous
 * URL's failure state.
 */
export default function ResilientImage({ src, fallback, onError, ...props }: ResilientImageProps) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setFailed(!src);
  }, [src]);

  if (!src || failed) return <>{fallback}</>;

  return <img {...props} src={src} onError={(event) => {
    setFailed(true);
    onError?.(event);
  }} />;
}
