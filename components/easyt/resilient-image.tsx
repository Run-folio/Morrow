"use client";

import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";

type ResilientImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
  fallback: ReactNode;
  /** Reports which asset is actually visible, never merely attempted. */
  onDisplayState?: (displayed: boolean) => void;
};

/**
 * Keeps provider and persisted-image failures inside the media slot that owns
 * them. A later source gets a fresh attempt instead of inheriting the previous
 * URL's failure state.
 */
export default function ResilientImage({ src, fallback, onError, onLoad, onDisplayState, ...props }: ResilientImageProps) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => {
    setFailed(!src);
    onDisplayState?.(false);
  }, [src, onDisplayState]);

  if (!src || failed) return <>{fallback}</>;

  return <img {...props} src={src} onError={(event) => {
    setFailed(true);
    onDisplayState?.(false);
    onError?.(event);
  }} onLoad={(event) => {
    onDisplayState?.(true);
    onLoad?.(event);
  }} />;
}
