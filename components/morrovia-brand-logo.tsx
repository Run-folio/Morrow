import Image from "next/image";
import styles from "./morrovia-brand-logo.module.css";

type MorroviaBrandLogoProps = {
  variant?: "full" | "mark" | "light";
  size?: "navigation" | "footer" | "compact";
  decorative?: boolean;
  className?: string;
  priority?: boolean;
};

const assets = {
  full: { src: "/brand/morrovia-full.png", width: 2172, height: 724 },
  light: { src: "/brand/morrovia-full-white.png", width: 2172, height: 724 },
  mark: { src: "/brand/morrovia-mark.png", width: 1254, height: 1254 },
} as const;

export default function MorroviaBrandLogo({
  variant = "full",
  size = "footer",
  decorative = false,
  className,
  priority = false,
}: MorroviaBrandLogoProps) {
  const asset = assets[variant];
  return (
    <span className={`${styles.logo} ${styles[variant]} ${styles[size]} ${className ?? ""}`}>
      <Image
        src={asset.src}
        width={asset.width}
        height={asset.height}
        sizes={variant === "mark" ? "32px" : "160px"}
        alt={decorative ? "" : "Morrovia"}
        priority={priority}
      />
    </span>
  );
}
