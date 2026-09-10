import type { ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import ResilientImage from "@/components/easyt/resilient-image";
import MorroviaPhotoCredit from "@/components/easyt/morrovia-photo-credit";
import { EasyTLinkButton } from "@/components/easyt/easyt-controls";
import type { DiscoveryImage } from "@/lib/easyt/discovery-catalogue";
import styles from "./routes-overview-hero.module.css";

export default function RoutesOverviewHero({ image, navigation, count, imageUnavailable }: { image: DiscoveryImage | null; navigation?: ReactNode; count: number; imageUnavailable: boolean }) {
  return <section className={styles.hero} aria-labelledby="routes-title">
    <ResilientImage className={styles.photograph} src={imageUnavailable ? null : image?.variants.at(-1)?.src} srcSet={image?.variants.map(variant => `${variant.src} ${variant.width}w`).join(", ")} sizes="100vw" alt={image?.alt ?? ""} width={1536} height={1024} loading="eager" fetchPriority="high" fallback={<div className={styles.photograph} />} />
    <div className={styles.shade} />
    {navigation}
    <div className={styles.copy}>
      <p className={styles.eyebrow}>ROUTES WITH A POINT OF VIEW</p>
      <h1 id="routes-title">Find a way through.<em>Make it yours.</em></h1>
      <p className={styles.support}>Considered journeys. Open possibilities.<br />Find your starting point, then change anything.</p>
      <EasyTLinkButton href="#discover-routes" variant="quiet" icon={ArrowDown} className={styles.browse}>Browse {count} starting points</EasyTLinkButton>
    </div>
    {image && !imageUnavailable && <MorroviaPhotoCredit placement="bottom-left" photoLabel={image.alt} credit={image.credit} sourceHref={image.sourceUrl} licenseHref={image.licenseUrl} fullCreditHref="/journey/immersive/credits.html" />}
  </section>;
}
